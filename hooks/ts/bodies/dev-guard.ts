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
// Tokenization pre-pass (Task-8, Invariant F): every covered-action router
// below is fed the OUTPUT of command-lexer.ts's prepareRoutableCommand(cmd),
// not the raw command, so an inert covered-action literal sitting inside a
// balanced, unwrapped quoted span (e.g. a read-only
// `grep "git push" file`) no longer satisfies the router's boundary-class
// and no longer trips a decision. Recognizers that do their OWN raw-string
// parsing (evaluateGitPush's leading quoting-and-composition guard; the
// gh-pr-create clean-autogate-form check) still receive the ORIGINAL,
// unmodified command — only the router `.test()` calls change their input.
//
// Coverage catalogue (mirrors dev-guard.sh header, closed and enumerated):
//   1. Push to a remote: git push (bare, -C, GIT_DIR=)
//   2. PR/issue writes by ANY binary (gh pr create/merge/review/comment,
//      gh issue create/edit/comment, gh api REST PUT/POST/PATCH/DELETE .../pulls,
//      gh api graphql PR-write mutations, curl/wget mutating method to api.github.com)
//   3. ClickUp MCP outward writes (tool.name matches write pattern, no command)
//
// Default: none (no-decision) — ask/deny/allow EXCLUSIVELY for covered actions.
//
// Fail-closed for covered actions: empty-cmd + raw-payload outward token → ask.
// ClickUp branch: gates on tool.name alone (command field absent → null).
//
// git-push recognizer: a CLOSED POSITIVE GRAMMAR. `allow` is emitted ONLY when
// the ENTIRE command matches the strict good form below; ANY deviation falls
// to `ask` (never `none` — `evaluate()` only reaches this recognizer once
// GIT_PUSH_RE already identifies the command as a covered push). This is
// deliberately NOT an enumerate-the-bad-forms model: a per-grapheme denylist
// (block quoting, then block that ref abbreviation, then block that case
// variant, ...) keeps leaking new spellings of the same gap. Validating the
// one good shape and rejecting everything else has no such enumeration
// surface.
//
//   Step 0 — hard reject on any character outside the shared safe set
//            `[A-Za-z0-9 _./-]` (command-lexer.ts's isLiteralSafeCommand,
//            Task-9, Invariant G) anywhere in the command — if the command
//            carries quoting, escaping, expansion, or composition, the
//            token this recognizer inspects is not reliably the value bash
//            executes.
//   Step 1 — hard reject on tree/directory redirection (`--git-dir`,
//            `--work-tree`, glue-agnostic) or an env-var prefix (`GIT_*=`) —
//            these decouple the tree git operates on from the payload cwd
//            the reader evaluates. EXCEPTION (Task-6, AC-6.1): a single,
//            spaced `-C {dir}` immediately after `git` and before `push` is
//            recognized as a TARGET, not rejected — the recognizer resolves
//            Steps 3-7 against that directory instead of the payload cwd
//            (see extractExactCDirPushTail). Any other `-C` shape (glued
//            `-C/path`, a second `-C`, `-C` mixed with another redirect, or
//            `-C` not immediately preceding `push`) still hard-rejects here,
//            unchanged.
//   Step 2 — the ENTIRE command must be exactly a single, bare `git push ...`
//            invocation: nothing precedes `git`, nothing but `push` follows
//            it as the subcommand.
//   Step 3 — every flag after `push` must be on a strict benign allowlist
//            (`-u`/`--set-upstream`, `-v`/`--verbose`, `--progress`); any
//            other flag (force, `--mirror`, `--all`, `--tags`, `--delete`,
//            `-o`, an unrecognized flag, ...) disqualifies.
//   Step 4 — a remote positional, if present, must be exactly `origin`.
//   Step 5 — at most one refspec; no `+`-prefix; no tag-literal destination;
//            `HEAD`/`@` resolve to the current branch via the reader; the
//            destination must be a PLAIN branch name whose first path
//            segment is not a ref-namespace word (`refs`/`heads`/`tags`/
//            `remotes`, case-insensitive) — this single rule closes every
//            qualified/abbreviated/case-variant ref form in one shot.
//   Step 6 — default-branch resolution is fail-closed: the static
//            `{main, master}` set is an ask-FLOOR (never a permissive
//            fallback); an `allow` requires the reader to POSITIVELY resolve
//            the real default AND the destination to differ from it — an
//            unresolvable default never licenses an allow.
//   Step 7 — bare `git push` (no refspec) resolves `@{push}` and applies
//            Step 6 to the PUSH DESTINATION branch, not the current branch
//            (closes a triangular `branch.<n>.merge` config).
//
// The default/no-covered path stays `none()` — it never becomes `allow`.
//
// gh --repo/-R target-awareness (Task-6, AC-6.1): gh's `--repo`/`-R` global
// flag may be interspersed ANYWHERE before the mutating subcommand+verb
// (Cobra parses persistent flags regardless of position), e.g.
// `gh --repo owner/repo pr create`. Every mutating-gh router below tolerates
// one such flag occurrence between `gh` and the verb, closing a real
// coverage gap: the prior routers only matched `gh\s+pr\s+create` etc.
// literally, so a leading `--repo` defeated detection entirely (the command
// fell through to none() — the normal, non-hardened permission flow). The
// resolved target repo (when present) is surfaced in the `ask` reason for
// operator transparency; the underlying decision (ask, or allow only for a
// clean autogated `gh pr create`) is unchanged by which repo is targeted.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";
import {
  prepareRoutableCommand,
  isLiteralSafeCommand,
  isBenignPushFlag,
  isPlainBranchDestination,
} from "./command-lexer.js";

// ---------------------------------------------------------------------------
// DevGuardReader — injected by the entry module (mirrors PrepublishReader).
// Exec is bounded to the bare-push and HEAD/@ resolution paths; every method
// fails open to null so the body can fail-closed to `ask` (composition:
// reader fails open, gate fails closed — see prepublish-guard.ts).
// ---------------------------------------------------------------------------

export interface DevGuardReader {
  /** git rev-parse --abbrev-ref HEAD; null on any error. When `dir` is given
   *  (Task-6, AC-6.1 — the `git -C {dir} push` closed form), resolves the
   *  current branch OF THAT DIRECTORY, not the payload cwd; absent `dir`
   *  resolves against the payload cwd exactly as before (backward-compat). */
  gitCurrentBranch(dir?: string): string | null;
  /** Resolve the repo's default branch name via git (e.g. origin/HEAD symref);
   *  null on any error. A null here means the default cannot be POSITIVELY
   *  resolved — the recognizer never falls back to permissively allowing a
   *  name simply because it isn't literally main/master (see Step 6). When
   *  `dir` is given (AC-6.1), resolves the default branch OF THAT DIRECTORY;
   *  absent `dir` resolves against the payload cwd (backward-compat). */
  resolveDefaultBranch(dir?: string): string | null;
  /** Resolve the EFFECTIVE push destination for the current branch as a
   *  `<remote>/<ref>` symbolic name (git's own `@{push}` resolution — honors
   *  `branch.<n>.pushRemote` → `remote.pushDefault` → `branch.<n>.remote`,
   *  in that precedence); null on any error (no upstream/push target
   *  configured, or ambiguous). Resolution is by NAME, not by URL — the
   *  integrity of what "origin" points to is a model assumption; remote-
   *  mutating commands (git remote set-url|add|rename|set-head) are not in
   *  this gate's covered set and remain prompted through the normal
   *  permission flow. The `set-head` case: a stale or spoofed
   *  `origin/HEAD` can also mislead Step 6's default-branch resolution — see
   *  docs/permission-provisioning.md § Documented residuals for the accepted
   *  residual and its scope (non-standard-default repos only; the
   *  `{main, master}` floor is unconditional and unaffected). The bare
   *  `-C {dir} push` form (no refspec) ALSO uses this method, scoped to
   *  `dir` (see evaluateBarePushAt) — an earlier revision resolved the `-C`
   *  bare-push destination via `gitCurrentBranch(dir)` alone and never
   *  checked the effective remote for that directory; a `branch.<n>.
   *  pushRemote`/`remote.pushDefault` pointing at a non-origin remote then
   *  passed silently (SEC-DR-B remediation, Round 1). Both the plain and the
   *  `-C {dir}` bare-push forms now resolve `@{push}` and apply the same
   *  origin-by-name check before evaluating the destination branch. */
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

// ---------------------------------------------------------------------------
// ClickUp MCP write-pattern (mirrors _clickup_write_pattern in dev-guard.sh)
// mcp__ + any server segment (including underscores for multi-word server names)
// + __clickup_(write verbs)
// ---------------------------------------------------------------------------
const CLICKUP_WRITE_RE =
  /^mcp__.+__clickup_(update_task|create_task|create_task_comment|attach_task_file|delete_task)$/;

// ---------------------------------------------------------------------------
// Outward-action detection patterns (verbatim from dev-guard.sh sections 2a-2f)
// ---------------------------------------------------------------------------

// 2a. git push — a deliberately BROAD detector: its only job is "route this
// into the strict positive-grammar recognizer below", never "this form is
// safe". Any git invocation ending in a push subcommand, however dressed up
// (glued/spaced -C, --git-dir/--work-tree, env-assignment connectors),
// counts as covered so it reaches the recognizer instead of silently
// defaulting to none(). Case-insensitive: on a case-insensitive filesystem
// (Windows/Git Bash) `GIT PUSH ...` still runs, so the router must still
// route it in — the recognizer below (which stays case-sensitive) is what
// keeps a mixed-case form from ever resolving to allow. BOTH boundaries
// around the verb admit a glued shell metacharacter — leading
// ([\s|;&<>()`]) and trailing ([;&|<>()`"'$]) — so a metacharacter fused to
// the verb with no space on EITHER side (`(git push origin main)`,
// `true&&git push`, `git push>/dev/null`, `git push$(evil)`, `( git push)`)
// still routes into the recognizer, where rejectShellQuotingOrComposition /
// rejectTreeOrEnvRedirect or the exact-form check ask on it. Without both, a
// narrower boundary would miss the glued form, evaluate() would return
// none(), and bash would still run the
// `<verb> <args>` (and any $()-substituted command) ungated. The classes cover
// the bash word-separators that leave the verb a complete token (\n is already
// covered by \s), so every glued form the router now admits is one the
// recognizer rejects to ask.
const GIT_PUSH_RE =
  /(^|[\s|;&<>()`])git(\s+-C\s+\S+|\s+--git-dir(?:=\S+|\s+\S+)|\s+--work-tree(?:=\S+|\s+\S+)|\s+-\S*|\s+\S+=\S+)*\s+push(\s|$|[;&|<>()`"'$])/i;

// gh --repo/-R target-awareness (Task-6, AC-6.1 — see module header). gh's
// `--repo`/`-R` persistent flag may sit BEFORE the subcommand+verb
// (`gh --repo owner/repo pr create`), which the prior routers missed
// entirely (no match -> none(), the un-hardened default). Every router below
// tolerates exactly one such flag occurrence between `gh` and the verb via
// the inlined `(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?` fragment — the
// `--repo owner/repo` FORM after the verb was already covered (the flag
// simply trails the matched substring). Kept as literal slash-delimited
// regex declarations, not a string-built `new RegExp(...)` call, so
// tests/test_permission_disjointness.py's source-level pattern extraction
// still discovers and samples these routers — string-built construction
// would silently drop them from that coupling floor.

// 2b. gh pr create (mutating verb only — read-only gh pr view/list/status stay ungated)
// Case-insensitive router — see GIT_PUSH_RE comment above.
const GH_PR_CREATE_RE =
  /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+create(\s|$|[;&|<>()`"'$])/i;

// 2c. gh pr merge (case-insensitive router)
const GH_PR_MERGE_RE =
  /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+merge(\s|$|[;&|<>()`"'$])/i;

// 2c. gh pr review (including --dismiss) (case-insensitive router)
const GH_PR_REVIEW_RE =
  /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+review(\s|$|[;&|<>()`"'$])/i;

// 2d. gh pr comment (case-insensitive router)
const GH_PR_COMMENT_RE =
  /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+comment(\s|$|[;&|<>()`"'$])/i;

// 2e. gh api -X PUT|POST|PATCH|DELETE ... /pulls
const GH_API_REST_PR_RE =
  /(^|[\s|;&<>()`])gh\s+api\s+.*(-X|--method)\s*(PUT|POST|PATCH|DELETE).*pulls/i;

// 2e-bis. gh api graphql with a PR-write mutation name
// Read-only reviewThreads listing queries carry no mutation name → nodecision.
const GH_GRAPHQL_RE = /(^|[\s|;&<>()`])gh\s+api\s+graphql/i;
const GRAPHQL_PR_MUTATIONS_RE =
  /(resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|addPullRequestReviewComment|addPullRequestReview|submitPullRequestReview|mergePullRequest)/;

// 2e-ter. gh issue mutating writes (create, edit, comment).
// Read-only gh issue list / gh issue view stay ungated (no outward side-effect).
// Case-insensitive router — see GIT_PUSH_RE comment above. --repo/-R tolerant
// (AC-6.1), same rationale and literal-regex-declaration constraint as the
// pr-* routers above.
const GH_ISSUE_WRITE_RE =
  /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?issue\s+(create|edit|comment)(\s|$|[;&|<>()`"'$])/i;

// Extracts the `--repo`/`-R` target value from a gh command, if present, for
// inclusion in the ask reason (AC-6.1 transparency: the operator sees which
// repo the action targets, not just the payload cwd). Returns null when
// absent. Read-only — never changes the decision, which stays ask (or the
// existing autogate allow for a clean `gh pr create`) regardless of target.
const GH_REPO_FLAG_VALUE_RE = /(?:--repo|-R)(?:=(\S+)|\s+(\S+))/;
function extractGhRepoTarget(cmdStr: string): string | null {
  const m = GH_REPO_FLAG_VALUE_RE.exec(cmdStr);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

// 2f. curl/wget mutating method to api.github.com (both forms from dev-guard.sh)
const CURL_WGET_MUTATING_RE =
  /(^|[\s|;&<>()`])(curl|wget)\s.*(-X|--request)\s*(PUT|POST|PATCH|DELETE).*api\.github\.com/i;
const API_GITHUB_URL_RE = /api\.github\.com/i;
const MUTATING_METHOD_RE = /(-X|--request)\s*(PUT|POST|PATCH|DELETE)/i;

// Defence-in-depth (F-016): raw payload scan when cmd is empty (mirrors dev-guard.sh lines 185-189)
// Case-insensitive router — see GIT_PUSH_RE comment above.
const RAW_OUTWARD_SCAN_RE =
  /(git\s+push|gh\s+pr\s+(create|merge|review|comment)|gh\s+issue\s+(create|edit|comment)|gh\s+api.*pulls|api\.github\.com)/i;

// ---------------------------------------------------------------------------
// git-push recognizer — closed POSITIVE grammar (Steps 0-7, see module header)
// ---------------------------------------------------------------------------

// Step 0 — the char-gate is the shared isLiteralSafeCommand (Task-9,
// Invariant G, command-lexer.ts): if ANY character outside the safe set
// `[A-Za-z0-9 _./-]` appears anywhere in the command, the destination token
// this recognizer would inspect is not reliably the value bash runs at
// execution time (`"main"`, `'main'`, `ma\in`, `${x:-main}`, `main{,}` all
// differ from the literal static string but can all evaluate to `main` at
// runtime). Strict superset of the retired local denylist
// (`["'\\$]`) — rejects everything that rejected, plus `{}*?[]~+:`, closing
// the brace-refspec-force bug (AC-6) the old denylist let through.

// Shell chaining/control/subshell-substitution operators, anywhere in the
// command. `allow` is reserved for a single, un-chained `git push` — a
// command carrying any of these could certify one clause while authorizing
// the WHOLE Bash tool call (a safe push followed by an unrelated chained
// command, or a second, dangerous push).
const SHELL_COMPOSITION_RE = /[;&|`\n<>]|\$\(/;

// A directory/tree redirection or an environment-variable prefix that could
// decouple the tree git operates on from the payload cwd the reader
// evaluates. Scanned across the FULL command string (not just a matched
// git-invocation segment) because an env-var prefix like `GIT_DIR=/x git
// push` sits BEFORE the `git` token, and glue-agnostic for `-C` so `-C/path`
// (no space) is caught exactly like `-C /path`.
const TREE_OR_ENV_REDIRECT_RE = /((^|\s)-C(?=[\s/=]|$)|--git-dir\b|--work-tree\b|\bGIT_[A-Z_]+=)/;

// Step 2 — the ENTIRE (already hard-reject-checked) command must start with
// exactly this: nothing precedes `git`, nothing but `push` follows it.
const GIT_PUSH_EXACT_RE = /^git\s+push(\s|$)/;

// Step 1 exception (Task-6, AC-6.1) — the ONE tree-redirection shape the
// recognizer resolves against a real target instead of hard-rejecting: a
// single, SPACED `-C {dir}` immediately after `git`, with nothing but `push`
// as the next token. Deliberately narrow: the glued form (`-C/tmp/o`, no
// space) is NOT matched here and continues to hard-reject via
// TREE_OR_ENV_REDIRECT_RE (unchanged, conservative default for a shape this
// recognizer does not parse). `dir` is captured as `\S+` — Step 0 (shell
// quoting/composition reject) has already run on the full command by the
// time this is tested, so `dir` cannot itself carry a quoting/expansion/
// composition character.
const GIT_C_DIR_PUSH_EXACT_RE = /^git\s+-C\s+(\S+)\s+push(\s|$)/;

// The case-insensitive GH_PR_CREATE_RE router only ROUTES a payload into the
// autogate branch; the autogate `allow` itself requires this exact, case-
// sensitive, single-invocation form (mirrors GIT_PUSH_EXACT_RE). A mixed-case
// (`GH pr create`) or shell-composed (`gh pr create && …`) form matches the
// router but not this recognizer, so it falls through to ask instead of
// auto-allowing the whole Bash call. --repo/-R tolerant (AC-6.1) via the same
// inlined fragment as the router — a leading --repo does not change the
// decision, only which repo the allowed pr-create targets. Literal
// declaration (not `new RegExp(...)`) for the same extraction-coupling
// reason as the router regexes above.
const GH_PR_CREATE_EXACT_RE = /^gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+create(\s|$)/;

// Step 3 — the ONLY flags that do not disqualify the safe form. Deliberately
// minimal: `-u`/`--set-upstream` is the primary first-push-of-a-feature-
// branch flag (the auto-allow recognizer's core use case); `-v`/`--verbose`/
// `--progress` are output-only. Force, `--mirror`, `--all`, `--tags`,
// `--delete`, `-o`/`--push-option`, `+`-prefixed refspecs, and any
// unrecognized flag are NOT here and therefore disqualify by omission.
// Shared with gate-guard.ts's grammar via command-lexer.ts's
// isBenignPushFlag (Task-9, Invariant G) — no longer declared locally.

// Step 5 — tag-literal destination heuristic: `git push origin v1.2.3` is a
// tag push even without `refs/tags/` or `--tags`. The optional prefix accepts
// both cases (`v`/`V`) — a tag-like destination must ask regardless of the
// case of its leading letter.
const TAG_LIKE_RE = /^[vV]?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$/;

// The destination-shape check above (see module header) requires a plain,
// non-ref-namespace-qualified branch name to be considered a plain branch
// name at all. No longer declared locally (Invariant G): both the full-shape
// character class AND the ref-namespace-word exclusion (`refs`/`heads`/
// `tags`/`remotes`) now live in command-lexer.ts's shared
// isPlainBranchDestination, so this recognizer and gate-guard.ts's
// matchBenignPushGrammar accept the exact same destination shape — see
// command-lexer.ts for the closes-every-qualified/abbreviated/case-variant-
// form-in-one-shot rationale.

// Step 6 — the ask-FLOOR: checked case-insensitively, and NEVER a permissive
// fallback. An earlier design used this set as a fallback allowlist when the
// dynamic default failed to resolve — that fallback is exactly what let a
// non-standard default (`develop`) leak an `allow` when `origin/HEAD` was
// absent locally. Under this design, an unresolvable dynamic default is
// unconditionally `ask` (see evaluateDestinationBranch) — this floor only
// ever narrows toward `ask`.
const DEFAULT_BRANCH_FLOOR = new Set(["main", "master"]);

const GATE_DOC_POINTER = "see docs/dev-mode.md § Outward-Action Gate";

// Step 0 — hard reject that must clear before any parsing is attempted.
// Returns the `ask` decision, or null to continue into Step 1.
function rejectShellQuotingOrComposition(cmdStr: string): NormalizedDecision | null {
  if (!isLiteralSafeCommand(cmdStr)) {
    return ask(
      `outward action 'git push' contains a shell quoting/escaping/expansion/composition character — the inspected token cannot be trusted to equal the value bash actually runs; fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return null;
}

// Step 1 — hard reject on any tree/env redirection OTHER than the single,
// spaced `-C {dir}` exact shape (which the caller resolves separately — see
// extractExactCDirPushTail / evaluateGitPush, AC-6.1). Returns the `ask`
// decision, or null to continue into Step 2.
function rejectTreeOrEnvRedirect(cmdStr: string): NormalizedDecision | null {
  if (TREE_OR_ENV_REDIRECT_RE.test(cmdStr)) {
    return ask(
      `outward action 'git push' combined with a tree/directory redirection (--git-dir, --work-tree, a GIT_*= environment prefix, a glued/second/misplaced -C) requires explicit operator approval — the payload-cwd reader would evaluate a different tree than the one git operates on; only the single, spaced 'git -C {dir} push ...' shape is resolved against a real target (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return null;
}

// Step 2 — the ENTIRE command must be exactly a single, bare `git push ...`.
// Returns the argument tail (everything after `push`, trimmed), or null when
// the command does not match this shape at all (nothing may precede `git`;
// nothing but `push` may follow it as the subcommand).
function extractExactPushTail(trimmedCmd: string): string | null {
  const m = GIT_PUSH_EXACT_RE.exec(trimmedCmd);
  return m ? trimmedCmd.slice(m[0].length).trim() : null;
}

// Step 1 exception (AC-6.1) — extracts `{dir, tail}` from the exact
// `git -C {dir} push ...` shape, or null when the command does not match
// this shape at all (falls through to the unconditional tree/env-redirect
// reject in evaluateGitPush).
function extractExactCDirPushTail(trimmedCmd: string): { dir: string; tail: string } | null {
  const m = GIT_C_DIR_PUSH_EXACT_RE.exec(trimmedCmd);
  if (!m) return null;
  return { dir: m[1], tail: trimmedCmd.slice(m[0].length).trim() };
}

// Step 6 — default-branch resolution, fail-closed. The static floor is
// checked first (case-insensitive, never bypassable); an `allow` requires
// the reader to POSITIVELY resolve the real default AND the destination to
// differ from it — that comparison is ALSO case-insensitive, so a
// case-insensitive remote/filesystem can never collapse a differently-cased
// spelling of the resolved default into an `allow`. An unresolvable default
// is never treated as license to allow a name simply because it isn't
// literally main/master.
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

// Step 7 — bare `git push` (no refspec) or `git push origin` (remote given,
// no refspec): resolve `@{push}` and require BOTH the effective remote to be
// `origin` AND the effective destination BRANCH (not the current branch) to
// be positively non-default. Checking the destination branch — not the
// branch currently checked out — closes a triangular `branch.<n>.merge`
// config, where `@{push}` can resolve to a different branch than HEAD.
// AC-6.1, remediated (SEC-DR-B Round 1) — for the `-C {dir}` form, an absent
// refspec resolves via the directory's effective push destination
// (reader.resolveEffectivePushRemoteRef(dir), git's own `@{push}`
// resolution — honors `branch.<n>.pushRemote` → `remote.pushDefault` →
// `branch.<n>.remote` for THAT directory), mirroring evaluateBarePush's
// plain-form logic exactly instead of the earlier `gitCurrentBranch(dir)`
// shortcut. The earlier shortcut only inspected the current branch name and
// never checked which remote a bare push would actually resolve to for that
// directory — a `branch.<n>.pushRemote`/`remote.pushDefault` pointing at a
// non-origin remote silently passed. Resolving `@{push}` closes that gap:
// the remote name is checked with the same `remote !== "origin"` rule as
// the non-`-C` path, so a non-origin effective remote asks instead of
// silently allowing, and an unresolvable push target (no upstream
// configured for that directory) fails closed to ask rather than falling
// back to a remote-blind branch check.
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

// Split a refspec on the LAST colon. An empty SOURCE side (`:dst`) is a
// delete refspec (returned as null) — an empty destination side (`src:`) is
// git's "push src to a remote ref named src" shorthand, not a delete, so it
// resolves to src. No colon at all returns the refspec unchanged.
function extractRawDestination(refspec: string): string | null {
  const colonIdx = refspec.lastIndexOf(":");
  if (colonIdx < 0) return refspec;
  const src = refspec.slice(0, colonIdx);
  if (src === "") return null;
  const afterColon = refspec.slice(colonIdx + 1);
  return afterColon === "" ? src : afterColon;
}

// `HEAD`/`@` resolve to the current branch via the reader (null if
// resolution fails); any other `@`-prefixed shorthand is not attempted and
// fails closed (returns null); anything else passes through unchanged.
function resolveSymbolicDestination(rawDst: string, reader: DevGuardReader, dir?: string): string | null {
  if (rawDst === "HEAD" || rawDst === "@") {
    return dir !== undefined ? reader.gitCurrentBranch(dir) : reader.gitCurrentBranch();
  }
  if (rawDst.startsWith("@")) return null;
  return rawDst;
}

// Step 5 — single explicit refspec (`git push origin <refspec>`, or
// `git -C {dir} push origin <refspec>` — AC-6.1 threads `dir` through so
// HEAD/@ resolution and the default-branch comparison both target the same
// directory named by `-C`, never the payload cwd).
function evaluateSingleRefspec(refspec: string, reader: DevGuardReader, dir?: string): NormalizedDecision {
  if (refspec.startsWith("+")) {
    return ask(
      `outward action 'git push' with a '+' force-prefixed refspec requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  const rawDst = extractRawDestination(refspec);
  if (rawDst === null) {
    return ask(
      `outward action 'git push' with an empty-source (delete) refspec requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (TAG_LIKE_RE.test(rawDst)) {
    return ask(
      `outward action 'git push' to a tag ref requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  const dst = resolveSymbolicDestination(rawDst, reader, dir);
  if (dst === null) {
    return ask(
      `outward action 'git push' with an unresolved symbolic destination ('${rawDst}') requires explicit operator approval — resolution is attempted only for bare HEAD/@; fail-closed on any other shorthand or resolution fault (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (!isPlainBranchDestination(dst)) {
    return ask(
      `outward action 'git push' with a destination that is not a plain branch name ('${dst}') requires explicit operator approval — fail-closed on any ref-namespace-qualified or malformed destination (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return evaluateDestinationBranch(
    dst,
    reader,
    `single refspec push to non-default branch '${dst}' on 'origin' recognized as the closed safe form`,
    dir
  );
}

// Steps 2-4 dispatcher (shared by the plain and `-C {dir}` forms): flag
// allowlist, remote name, refspec count. Steps 5-7 are delegated to
// evaluateSingleRefspec/evaluateBarePush, both `dir`-aware (AC-6.1).
function evaluatePushArgs(tail: string, reader: DevGuardReader, dir?: string): NormalizedDecision {
  const targetLabel = dir !== undefined ? `'git -C ${dir} push'` : "'git push'";

  const tokens = tail.length > 0 ? tail.split(/\s+/).filter(Boolean) : [];
  const flagTokens = tokens.filter((t) => t.startsWith("-"));
  const positional = tokens.filter((t) => !t.startsWith("-"));

  const disqualifyingFlags = flagTokens.filter((t) => !isBenignPushFlag(t));
  if (disqualifyingFlags.length > 0) {
    return ask(
      `outward action ${targetLabel} with disqualifying flag(s) (${disqualifyingFlags.join(", ")}) requires explicit operator approval — only -u/--set-upstream/-v/--verbose/--progress are on the benign allowlist (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (positional.length === 0) {
    return evaluateBarePush(reader, dir);
  }

  const remoteToken = positional[0];
  if (remoteToken !== "origin") {
    return ask(
      `outward action ${targetLabel} to a remote other than 'origin' (resolved by NAME) requires explicit operator approval — origin-URL integrity is a model assumption, and 'git remote set-url|add|rename|set-head' stay outside this allowlist (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  if (positional.length === 1) {
    return evaluateBarePush(reader, dir);
  }

  if (positional.length > 2) {
    return ask(
      `outward action ${targetLabel} with more than one refspec requires explicit operator approval — the recognizer allows exclusively a single simple refspec (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return evaluateSingleRefspec(positional[1], reader, dir);
}

// Steps 1-4 dispatcher: resolves the `-C {dir}` exact form first (AC-6.1) —
// unresolvable/ambiguous target dirs still ask (never a silent allow, since
// evaluatePushArgs/evaluateBarePush/evaluateSingleRefspec all fail closed to
// ask on a null reader result), so an absent or non-git target directory
// degrades to the same conservative outcome the unconditional hard-reject
// used to produce. Any other tree/env-redirect shape, or the absence of any
// redirect at all, falls through to the plain exact-invocation shape
// unchanged.
function evaluateGitPush(cmdStr: string, reader: DevGuardReader): NormalizedDecision {
  const quotingReject = rejectShellQuotingOrComposition(cmdStr);
  if (quotingReject) return quotingReject;

  const trimmed = cmdStr.trim();

  const cDirForm = extractExactCDirPushTail(trimmed);
  if (cDirForm) {
    return evaluatePushArgs(cDirForm.tail, reader, cDirForm.dir);
  }

  const redirectReject = rejectTreeOrEnvRedirect(cmdStr);
  if (redirectReject) return redirectReject;

  const tail = extractExactPushTail(trimmed);
  if (tail === null) {
    return ask(
      `outward action 'git push' is not expressed as a single, bare 'git push ...' invocation with nothing preceding it — fail-closed on any other structure (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }

  return evaluatePushArgs(tail, reader);
}

// ---------------------------------------------------------------------------
// gh pr create autogate — opt-in via ~/.claude/.team-harness.json
// `{ "autogate": { "pr_create": true } }`; default/absent → ask (unchanged).
// Does not bypass the prepublish-guard tests-before-PR floor: the two hooks
// evaluate independently and deny > allow at the platform precedence level.
// ---------------------------------------------------------------------------

function isPrCreateAutogateEnabled(reader: DevGuardReader): boolean {
  const config = reader.readConfig();
  if (!config) return false;
  const autogate = config["autogate"];
  if (!autogate || typeof autogate !== "object") return false;
  return (autogate as Record<string, unknown>)["pr_create"] === true;
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
    // Reconstruct a rough representation of the input for the raw scan.
    const rawRepr = JSON.stringify(input.tool?.input ?? {});
    if (RAW_OUTWARD_SCAN_RE.test(rawRepr)) {
      return ask(
        "outward action detected in raw payload (escape-aware extraction fallback); requires explicit operator approval (dev-guard.ts)"
      );
    }
    // No extractable command and no raw outward token — no decision.
    return none();
  }

  // No command and not a Bash tool — no decision.
  if (cmdStr === null) {
    return none();
  }

  // Step 2 — Detect outward/mutating actions by DESTINATION.

  // Task-8 pre-pass (Invariant F): routers below test the ROUTABLE string
  // (quoted-inert spans blanked, unless a command-executing wrapper or
  // unbalanced quoting is present — see command-lexer.ts). Recognizers that
  // do their own raw-string parsing keep receiving `cmdStr` unchanged.
  const { routable } = prepareRoutableCommand(cmdStr);

  // 2a. git push — closed recognizer decides allow vs ask (never none, since
  // GIT_PUSH_RE already identifies this as a covered action).
  if (GIT_PUSH_RE.test(routable)) {
    return evaluateGitPush(cmdStr, reader);
  }

  // AC-6.1 — resolved once per cmdStr; surfaced in the ask reason of every
  // gh branch below so the operator sees which repo is targeted even when
  // --repo/-R precedes the subcommand.
  const ghTargetRepo = extractGhRepoTarget(cmdStr);
  const ghTargetNote = ghTargetRepo ? ` (target repo: '${ghTargetRepo}')` : "";

  // 2b. gh pr create — autogate opt-in, default ask. The autogate `allow`
  // requires a clean, exactly-cased, single `gh pr create` invocation: the
  // case-insensitive router only routes here, and a mixed-case or shell-
  // composed form falls through to ask (mirrors the git push recognizer).
  // The clean-form check is a recognizer (not a router) and reads `cmdStr`,
  // the original command — never the blanked `routable` string.
  if (GH_PR_CREATE_RE.test(routable)) {
    const cleanAutogateForm =
      !SHELL_COMPOSITION_RE.test(cmdStr) &&
      GH_PR_CREATE_EXACT_RE.test(cmdStr.trim());
    if (cleanAutogateForm && isPrCreateAutogateEnabled(reader)) {
      return allow(
        `outward action 'gh pr create'${ghTargetNote} auto-allowed by opt-in config autogate.pr_create=true (dev-guard.ts); the prepublish-guard tests-before-PR floor still applies independently (deny > allow); ${GATE_DOC_POINTER}`
      );
    }
    return ask(
      `outward action 'gh pr create'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate`
    );
  }

  // 2c. gh pr merge
  if (GH_PR_MERGE_RE.test(routable)) {
    return ask(
      `outward action 'gh pr merge'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate`
    );
  }

  // 2c. gh pr review
  if (GH_PR_REVIEW_RE.test(routable)) {
    return ask(
      `outward action 'gh pr review'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate`
    );
  }

  // 2d. gh pr comment
  if (GH_PR_COMMENT_RE.test(routable)) {
    return ask(
      `outward action 'gh pr comment'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate`
    );
  }

  // 2e. gh api REST mutating PR endpoint
  if (GH_API_REST_PR_RE.test(routable)) {
    return ask(
      "outward action 'gh api' mutating PR endpoint requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2e-bis. gh api graphql with PR-write mutation name. GH_GRAPHQL_RE is the
  // boundary-class router (routable, quoted-inert-search false positives
  // apply); GRAPHQL_PR_MUTATIONS_RE is a content check whose real signal
  // legitimately lives INSIDE the `-f query='...'` quoted GraphQL document —
  // it must keep reading `cmdStr`, the original command, or a genuine
  // mutation call would be blanked away as a false negative.
  if (GH_GRAPHQL_RE.test(routable) && GRAPHQL_PR_MUTATIONS_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh api graphql' PR-mutating operation requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2e-ter. gh issue mutating writes (create, edit, comment)
  if (GH_ISSUE_WRITE_RE.test(routable)) {
    return ask(
      `outward action 'gh issue write'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate`
    );
  }

  // 2f. curl/wget mutating method to api.github.com (form 1: adjacent -X and api.github.com)
  if (CURL_WGET_MUTATING_RE.test(routable)) {
    return ask(
      "outward action via curl/wget to api.github.com with mutating method requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2f continued. (form 2: api.github.com URL anywhere + -X/--request anywhere in cmd)
  if (API_GITHUB_URL_RE.test(routable) && MUTATING_METHOD_RE.test(routable)) {
    return ask(
      "outward action to api.github.com with mutating method requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // Step 3 — No covered action detected; no decision.
  return none();
}
