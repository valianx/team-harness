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
// Covered-action detection: the command is resolved by command-lexer.ts's
// analyzeCommand (tokenize -> structure -> bounded recursive wrapper
// unwrapping -> resolved argv) and classifyCoveredAction (argv[0] basename
// equivalence — case-insensitive and `.exe`-stripped, centralized once in
// the shared classifier — so `git push`, `GIT push`, `git.exe push`,
// `git-push`, and a per-subcommand-binary form like
// `$(git --exec-path)/git-push` all classify identically). This is what
// closes the wrapper-embedded (`bash -c "git push origin main"`) and
// per-subcommand-binary bypass classes a raw-string router cannot see, and
// what keeps an inert covered-action literal sitting inside a quoted
// argument (`grep "git push" file`) from ever being classified as covered
// in the first place — no separate quote-blanking pre-pass is needed, the
// argv model settles both by construction. Same shared analyzer as
// dev-guard.ts — see that module's header for the wrapper/ambiguity
// fail-closed list.
//
// Force/shape detection (evaluate()) does not attempt to reconstruct a
// de-quoted argv from the raw string. It uses command-lexer.ts's
// matchBenignPushGrammar against the CLASSIFIED command's resolved argv —
// a closed positive grammar (Invariant G) that permits ONLY the exact
// benign push shape (`git push [benign-flags...] origin <plain-branch>`,
// where `<plain-branch>` excludes any ref-namespace-qualified or tag-like
// destination — a destination whose first `/`-segment is `refs`/`heads`/
// `tags`/`remotes`, checked via `isPlainBranchDestination`) and denies
// every deviation from that one shape — including a wrapper-embedded or
// per-subcommand-binary invocation, inspected identically to a bare one.
// This replaces a character-denylist that was defeated three times by three
// different shell token-reconstruction techniques — see command-lexer.ts
// for the by-construction rationale. See evaluate() for how the match
// result gates the deny.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";
import { analyzeCommand, classifyCoveredAction, matchBenignPushGrammar } from "./command-lexer.js";
import type { AnalyzedCommand, ArgvToken } from "./command-lexer.js";

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
// Covered-action classification — resolved-argv based (replaces the
// raw-string GIT_PUSH_RE/GH_PR_CREATE_RE routers). One covered command per
// call is enough: gate-guard only needs to know whether SOME effective
// command in the analysis is a covered push or `gh pr create`, and — for a
// push — which resolved argv tokens follow the subcommand, since those are
// what matchBenignPushGrammar inspects.
// ---------------------------------------------------------------------------

type CoveredMatch =
  | { kind: "push"; args: ArgvToken[] }
  | { kind: "pr-create" };

// `gh pr create`, case-insensitive on the subcommand+verb pair — mirrors the
// case-insensitivity of the retired GH_PR_CREATE_RE router.
function isGhPrCreateArgs(args: ArgvToken[]): boolean {
  return args[0]?.value.toLowerCase() === "pr" && args[1]?.value.toLowerCase() === "create";
}

// classifyCoveredAction (command-lexer.ts) centrally resolves binary/
// subcommand case-insensitively and `.exe`-stripped — a case-variant or
// `.exe` invocation (`GIT push`, `git.exe push`, `Git-Push`) already
// classifies as `binary: "git"` with `gitSubcommand` populated. gate-guard
// only ever denies (never allows), so no `binaryCaseExact` gate is needed
// here — this hook does not need its own per-hook case-insensitive fallback.
function findCoveredMatch(analyzed: AnalyzedCommand): CoveredMatch | null {
  for (const effective of analyzed.commands) {
    const classified = classifyCoveredAction(effective);
    if (classified === null) continue;

    if (classified.binary === "git" && classified.gitSubcommand?.toLowerCase() === "push") {
      return { kind: "push", args: classified.args };
    }
    if (classified.binary === "gh" && isGhPrCreateArgs(classified.args)) {
      return { kind: "pr-create" };
    }
  }
  return null;
}

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

  // Covered-action detection: resolve the command's real argv (wrapper
  // recursion, per-subcommand-binary basename equivalence) and classify
  // each effective command — see module header. An inert covered-action
  // literal inside a quoted argument never classifies as covered, by
  // construction (it is an argument token, never its own effective
  // command), so no separate quote-blanking pre-pass is needed here.
  const covered = findCoveredMatch(analyzeCommand(rawCmd));
  if (covered === null) return none();

  const lane = resolveGoverningLane(reader);
  if (lane === null) return none(); // no governing lane resolves — defer.

  // Force/shape deny (Invariant G), unconditional on gate3_release,
  // checked before the order gate. matchBenignPushGrammar inspects the
  // CLASSIFIED command's resolved argv, so a wrapper-embedded or
  // per-subcommand-binary force-push is inspected the same as a bare one —
  // see command-lexer.ts for the by-construction rationale.
  if (covered.kind === "push") {
    const argv = covered.args.map((tok) => tok.value);
    const tainted = covered.args.map((tok) => tok.tainted);
    if (!matchBenignPushGrammar(argv, tainted, reader).matched) {
      return deny(
        "gate-guard: force-push denied — unconditional on gate3_release for a detected pipeline lane (Invariant E/G). Only the exact benign form (git push [-u|--set-upstream|-v|--verbose|--progress] origin <plain-branch>) is authorized in-lane, resolved from the executed argv — a wrapper-embedded or per-subcommand-binary invocation is inspected the same as a bare command; any deviation — a force flag, a '+'-prefixed refspec, a tainted/unresolved token, or a tag-like/ref-namespace-qualified destination — is denied, even after 'ship'. See agents/_shared/gate-contract.md § Outward-action release floor."
      );
    }
  }

  // Order gate: gate3_release must be exactly `ship`; any other value or an
  // absent field denies — never `none` here.
  const gate3Release = readField(lane, "gate3_release");
  if (gate3Release === "ship") return none();

  return deny(
    "gate-guard: outward action blocked — the resolved pipeline lane has not registered gate3_release: ship at STAGE-GATE-3. Complete STAGE-GATE-3 before pushing or opening the PR. See agents/_shared/gate-contract.md § Outward-action release floor."
  );
}
