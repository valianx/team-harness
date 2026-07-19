// hooks/ts/bodies/gate-guard.ts
// Canonical body — the deterministic outward-action ORDER floor described in
// agents/_shared/gate-contract.md § "Outward-action release floor". Runtime-
// pure: imports no runtime symbol; reads only NormalizedInput (+ the
// injected GateGuardReader); returns only NormalizedDecision. Never branches
// on `input.runtime`. Modeled 1:1 on prepublish-guard.ts's evaluate() +
// injected-reader shape.
//
// Decision set is {none, deny} ONLY — this hook never emits `ask`.
// Fail mode: no lane resolves -> `none` (defers to dev-guard/policy-block);
// a lane resolves -> fail-CLOSED (any post-resolution read fault denies,
// same as an explicit non-ship value).
//
// Tokenization pre-pass (Invariant F): the covered-verb routers
// below are fed command-lexer.ts's prepareRoutableCommand(cmd) output, not
// the raw command, so an inert covered-action literal inside a balanced,
// unwrapped quoted span (e.g. a read-only `grep "git push" file` run
// mid-pipeline) no longer trips an in-lane deny. Same shared router
// pre-pass as dev-guard.ts — see that module's header for the
// wrapper/ambiguity fail-closed list.
//
// Force-push detection (evaluate()) does not attempt to reconstruct the
// true, de-quoted argv. It uses command-lexer.ts's matchBenignPushGrammar —
// a closed positive grammar (Invariant G) that permits ONLY the exact
// benign push shape (`git push [benign-flags...] origin <plain-branch>`,
// where `<plain-branch>` excludes any ref-namespace-qualified or tag-like
// destination — a destination whose first `/`-segment is `refs`/`heads`/
// `tags`/`remotes`, checked via `isPlainBranchDestination` — every
// character in the safe set) and denies every deviation from that one
// shape. This replaces a character-denylist that was defeated three times by three
// different shell token-reconstruction techniques — see command-lexer.ts
// for the by-construction rationale. See evaluate() for how the match
// result gates the deny.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";
import { prepareRoutableCommand, matchBenignPushGrammar } from "./command-lexer.js";

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

function deny(reason: string): NormalizedDecision {
  return { decision: "deny", reason, mutations: null };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// ---------------------------------------------------------------------------
// GateGuardReader interface — injected by the entry module. Mirrors
// checkpoint-guard's StateReader (state discovery) plus one addition,
// gitCurrentBranch, needed for the working_branch correlation.
// ---------------------------------------------------------------------------

export interface GateGuardReader {
  /** Read file content as UTF-8 string; returns null on any error. */
  readFile(path: string): string | null;
  /** List files matching name recursively up to maxDepth; return empty array on error. */
  findFiles(rootDir: string, name: string, maxDepth: number): string[];
  /** Return modification time (ms since epoch) or 0 on error. */
  mtime(path: string): number;
  /** Read ~/.claude/.team-harness.json; returns null on any error. */
  readConfig(): Record<string, unknown> | null;
  /** Current working directory (the workspace search root / worktree cwd). */
  cwd(): string;
  /** Resolve a path to its canonical form (symlinks and ".." collapsed);
   *  returns null when the path does not exist or cannot be resolved. */
  realpath(path: string): string | null;
  /** Resolve the name of the git repository that owns the current working
   *  directory (git-common-dir derived, worktree-stable). Returns null when
   *  cwd() is not inside a git repository or git is unavailable. */
  gitRepoName(): string | null;
  /** git rev-parse --abbrev-ref HEAD, scoped to cwd(); null on any error
   *  (non-git directory, detached HEAD resolution failure). */
  gitCurrentBranch(): string | null;
}

// ---------------------------------------------------------------------------
// Routers — case-insensitive, verbatim copy of prepublish-guard.ts's
// GIT_PUSH_RE/GH_PR_CREATE_RE. Redefined here rather than imported — bodies
// stay independently testable, not dependent on a sibling's regex.
// ---------------------------------------------------------------------------

const GIT_PUSH_RE = /(^|[\s|;&<>()`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$|[;&|<>()`"'$])/i;
const GH_PR_CREATE_RE = /(^|[\s|;&<>()`])gh\s+pr\s+create(\s|$|[;&|<>()`"'$])/i;

// ---------------------------------------------------------------------------
// 00-state.md field parsing — mirrors checkpoint-guard.ts's readField/
// isTerminalStatus exactly (same "- field: value" line convention).
// ---------------------------------------------------------------------------

function readField(content: string, field: string): string | null {
  const lines = content.split("\n");
  const prefix = new RegExp(`^\\s*-\\s*${field}:\\s*(.+?)\\s*$`);
  for (const line of lines) {
    const m = prefix.exec(line);
    if (m) return m[1]!;
  }
  return null;
}

function isTerminalStatus(content: string): boolean {
  const status = readField(content, "status");
  if (status === null) return false;
  return status === "complete" || status.startsWith("blocked-");
}

// ---------------------------------------------------------------------------
// Candidate discovery — parity with checkpoint-guard.ts's selectByMtime:
// the local session-notes directory tree under cwd, plus the obsidian vault
// subtree when logs-mode: obsidian is configured.
// ---------------------------------------------------------------------------

function resolveRepoName(reader: GateGuardReader): string {
  const gitName = reader.gitRepoName();
  if (gitName) return gitName;
  return reader.cwd().split(/[/\\]/).filter(Boolean).pop() ?? "";
}

function gatherCandidatePaths(reader: GateGuardReader): string[] {
  const searchRoot = reader.cwd();
  const candidates: string[] = reader.findFiles(searchRoot, "00-state.md", 4);

  const config = reader.readConfig();
  if (config !== null) {
    const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
    const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
    const logsSub = typeof config["logs-subfolder"] === "string" ? config["logs-subfolder"] : "work-logs";

    if (logsMode === "obsidian" && logsPath) {
      const repoName = resolveRepoName(reader);
      if (repoName) {
        const vaultRoot = `${logsPath}/${logsSub}/${repoName}`;
        candidates.push(...reader.findFiles(vaultRoot, "00-state.md", 3));
      }
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Correlation — the step checkpoint-guard.ts does not need. A candidate
// counts as the governing lane only when it matches the current git context:
// working_branch equals the current branch, or realpath(cwd()) equals
// realpath(worktree). The literal string "null" is treated as an absent
// worktree field, never as a path to resolve.
// ---------------------------------------------------------------------------

function laneCorrelates(
  content: string,
  currentBranch: string | null,
  cwdReal: string | null,
  reader: GateGuardReader
): boolean {
  const workingBranch = readField(content, "working_branch");
  if (workingBranch !== null && currentBranch !== null && workingBranch === currentBranch) {
    return true;
  }

  const worktreeField = readField(content, "worktree");
  if (worktreeField !== null && worktreeField !== "null" && cwdReal !== null) {
    const worktreeReal = reader.realpath(worktreeField);
    if (worktreeReal !== null && worktreeReal === cwdReal) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Governing-lane resolution — mtime-selection over candidates (newest
// first), returning the first one that correlates. Returns null when no
// candidate exists or none correlates, deferring to dev-guard/policy-block
// rather than denying a manual push.
// ---------------------------------------------------------------------------

function resolveGoverningLane(reader: GateGuardReader): string | null {
  const paths = gatherCandidatePaths(reader);
  if (paths.length === 0) return null;

  const sorted = paths.slice().sort((a, b) => reader.mtime(b) - reader.mtime(a));
  const currentBranch = reader.gitCurrentBranch();
  const cwdReal = reader.realpath(reader.cwd());

  for (const candidatePath of sorted) {
    const content = reader.readFile(candidatePath);
    if (content === null) continue;
    if (isTerminalStatus(content)) continue;
    if (laneCorrelates(content, currentBranch, cwdReal, reader)) return content;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public evaluate function (with injected GateGuardReader for testability)
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput, reader: GateGuardReader): NormalizedDecision {
  const rawCmd =
    typeof input.tool?.input?.["command"] === "string" ? (input.tool.input["command"] as string) : "";

  if (!rawCmd) return none();

  // Pre-pass (Invariant F): routers test the ROUTABLE string (quoted-
  // inert spans blanked), so an inert quoted covered-action literal does
  // not trip an in-lane deny — see command-lexer.ts.
  const routable = prepareRoutableCommand(rawCmd).routable;
  const isGitPush = GIT_PUSH_RE.test(routable);
  const isGhPrCreate = GH_PR_CREATE_RE.test(routable);
  if (!isGitPush && !isGhPrCreate) return none();

  const lane = resolveGoverningLane(reader);
  if (lane === null) return none(); // no governing lane resolves — defer.

  // Force/shape deny (Invariant G), unconditional on gate3_release,
  // checked before the order gate. matchBenignPushGrammar reads rawCmd —
  // see command-lexer.ts for the by-construction rationale.
  if (isGitPush && !matchBenignPushGrammar(rawCmd).matched) {
    return deny(
      "gate-guard: force-push denied — unconditional on gate3_release for a detected pipeline lane (Invariant E/G). Only the exact benign form (git push [-u|--set-upstream|-v|--verbose|--progress] origin <plain-branch>) is authorized in-lane; any deviation — a force flag, a '+'-prefixed refspec, or any character outside the safe set [A-Za-z0-9 _./-] — is denied, even after 'ship'. See agents/_shared/gate-contract.md § Outward-action release floor."
    );
  }

  // Order gate: gate3_release must be exactly `ship`; any other value or an
  // absent field denies — never `none` here.
  const gate3Release = readField(lane, "gate3_release");
  if (gate3Release === "ship") return none();

  return deny(
    "gate-guard: outward action blocked — the resolved pipeline lane has not registered gate3_release: ship at STAGE-GATE-3. Complete STAGE-GATE-3 before pushing or opening the PR. See agents/_shared/gate-contract.md § Outward-action release floor."
  );
}
