// hooks/ts/bodies/command-lexer.ts
// Shared command analyzer for hooks/ts/bodies/dev-guard.ts, gate-guard.ts and
// policy-block.ts — see agents/_shared/gate-contract.md § "Outward-action
// release floor" (Invariant F/G). Single source of truth: bundled into all
// three .cjs artifacts by esbuild, never imported at .cjs-to-.cjs runtime
// (parity with entry/*.ts importing CONTROL_CHAR_RE from bodies/
// prepublish-guard.ts).
//
// Problem this closes: a boundary-character-class router over the raw
// command STRING cannot tell a covered action that is genuinely about to run
// from one sitting inert inside a quoted argument (`grep "git push" file`),
// and it cannot see past a command-executing wrapper (`bash -c "git push
// origin main"`) or a per-subcommand dispatcher binary
// (`$(git --exec-path)/git-push origin main`) at all — both bypass the
// router entirely. Fixing the false positive with a wider boundary class
// only worsens the false negative, and vice versa: the two failure modes
// share one root cause (matching on the string instead of on what actually
// executes).
//
// Mechanism: `analyzeCommand` is a bounded, linear-scan tokenizer that
// resolves the command's STRUCTURE — it splits on unquoted `;`/`&&`/`||`/
// `|`/`&`/newline, honors single/double-quote and backslash-escape removal,
// and treats `$(...)`/backtick command-substitution spans as opaque
// (consumed atomically so they cannot manufacture a false token boundary,
// but never expanded — the substring inside is never evaluated). Each
// resulting simple command becomes an `EffectiveCommand`: an `argv` of
// resolved tokens, each flagged `tainted` when it kept an unresolved shell
// metacharacter (`$VAR`, `$(...)`, backtick, `{`, `}`, `*`, `?`, `[`, `~`).
// A recognized command-executing wrapper (`bash|sh|zsh|dash|ksh|su -c
// <str>`, `eval <args>`, a literal `echo|printf <lit> | <shell>` pipe, or
// `xargs … <shell> -c <str>`) has its statically-resolvable payload
// recursively re-tokenized (bounded depth) and the resulting commands merged
// in; an unresolvable payload or an exceeded depth is surfaced on the result
// rather than silently dropped, so a caller fails closed instead of treating
// it as "no covered action".
//
// `classifyCoveredAction` keys on the resolved argv[0]'s basename (its last
// `/`-segment, case-insensitively and `.exe`-stripped — so `GIT`, `Git`,
// and `git.exe` all resolve identically to the canonical form) — so the
// dispatcher form (`git push ...`) and the per-subcommand-binary form
// (`git-push ...`, `$(git --exec-path)/git-push ...`, and their case/`.exe`
// variants) classify identically, closing the per-subcommand-binary bypass
// by construction rather than by enumerating dispatch paths. This
// case/extension normalization is centralized HERE, once, for every
// consumer — no hook re-implements its own partial fallback.
//
// Structural default (both wrapper-detection layers below): rather than
// maintaining a closed list of recognized-DANGEROUS forms to specially
// unwrap — the shape that reliably reopens on the next unenumerated name —
// each layer instead maintains a small, closed list of affirmatively SAFE
// forms to exempt, and treats everything else as a possible wrapper. A
// basename recognized as one of the ten modeled command-runner prefixes
// (`env`, `timeout`, `nice`, `nohup`, `command`, `stdbuf`, `setsid`, `time`,
// `sudo`, `doas`) is skipped past using its own known option grammar (kept
// for the runners whose flag shapes ARE modeled precisely); every other,
// UNRECOGNIZED leading basename — unless it is one of
// `SAFE_NON_EXECUTING_BASENAMES` (read-only/data-only tools that never
// spawn a child process from their own argv, e.g. `grep`, `cat`, `ls`) — is
// instead checked for a git/gh signal ANYWHERE later in the same argv
// (`scanForGitGhSignal`, case-insensitive/`.exe`-stripped, dispatcher-form
// aware). Finding one classifies the command as covered, unconditionally
// `requiresFailClosed` and never `binaryCaseExact` — closing an unenumerated
// runner/wrapper (`flock`, `chrt`, `unshare`, or anything invented
// tomorrow) with one mechanism instead of the next reported name. `git`'s
// own leading env-assignment prefixes and global options are resolved at
// their real, fixed arity (never a blanket "any flag consumes the next
// token") purely to LOCATE the true subcommand token — resolving past a
// prefix or option is never itself a license to allow: any option that
// redirects the tree/transport/config the command targets (`-c <k=v>`,
// `--git-dir`, `--work-tree`, `--namespace`, `--exec-path`, any non-exact
// `-C` form) or any leading shell env-assignment (`NAME=VALUE`, including
// every `GIT_[A-Z_]+=`) is SURFACED on the result as `requiresFailClosed`,
// never silently skipped-to-allow — the consuming hook applies its own
// ask/deny policy on that signal. Only `-p`/`--paginate`/`--no-pager` and an
// exact-resolved, single `-C {dir}` are inert enough to resolve without it;
// a case-variant or `.exe`-suffixed binary/subcommand token can still be
// classified as covered (`ask`/`deny`) but is never `binaryCaseExact`, so it
// can never itself reach `allow`.
//
// A producer piped into a bare shell (`curl … | bash`, not just the
// statically-resolvable `echo <lit> | bash` shape) applies the SAME
// safe-list-to-exempt inversion on the RECEIVING side: rather than requiring
// an exact match against a fixed set of named shells, any receiving
// basename not in `SAFE_NON_EXECUTING_BASENAMES` is treated as a potential
// shell/wrapper and resolves to unresolvable — closing a multi-call-binary
// shell dispatcher (`busybox sh`, `toybox ash`, an aliased/symlinked shell)
// the same way, by construction. An xargs replacement-string placeholder
// (`xargs -I{}`/`-i`/`--replace … "{}"`) forwarded as the wrapped payload,
// and `env -S`/`--split-string`'s own embedded-command argument, are both
// recognized as inherently unresolvable (or recursively resolved when
// statically known) rather than silently falling through as "no covered
// action" — see `detectPipeToShellPayload`, `extractXargsReplacementString`,
// and `extractEnvSplitStringPayload` below.
//
// `matchBenignPushGrammar` (Invariant G) is unchanged in spirit — it is
// still a CLOSED POSITIVE GRAMMAR that accepts exactly one benign push shape
// and denies every deviation, replacing an enumerate-the-bad-forms denylist
// that was defeated three times by three different shell token-
// reconstruction techniques — but it now consumes the analyzer's resolved
// argv + per-token taint instead of the raw command string, which is what
// lets it recognize a colon-refspec or a quoted-but-literal destination
// (previously rejected outright by the retired raw-string character gate)
// while still rejecting anything genuinely unresolved. A grammar match is
// necessary but not sufficient for an `allow` — the default-branch ask-floor
// is the CONSUMING hook's responsibility (dev-guard.ts), never this
// module's; this grammar validates push SHAPE only, never destination name.
//
// Design boundary (hard-won, KG
// `process-insight-force-push-positive-grammar-replaces-denylist`): this
// module tokenizes and resolves STRUCTURE — it never attempts shell
// EXPANSION (no brace, glob, variable, or command-substitution expansion).
// Any token that retains an unresolved metacharacter is `tainted`, and the
// positive grammar rejects every tainted token. Minimal parsing surface,
// recognize only the one legitimate shape, fail closed on any ambiguity.

// ---------------------------------------------------------------------------
// Public types — the resolved-argv model every consumer builds on.
// ---------------------------------------------------------------------------

export interface ArgvToken {
  /** The resolved (unquoted/unescaped) value when `tainted` is false; the
   *  verbatim source text — including the unresolved metacharacter — when
   *  `tainted` is true (no shell expansion is ever attempted). */
  value: string;
  /** True when this token retained an unresolved shell metacharacter
   *  ($VAR, $(...), backtick, {, }, *, ?, [, ~) that the analyzer cannot
   *  statically resolve to the value bash would actually pass. */
  tainted: boolean;
}

export interface EffectiveCommand {
  /** Resolved tokens for one simple command (no shell operators). */
  argv: ArgvToken[];
  /** True when any token in `argv` is tainted — convenience aggregate. */
  tainted: boolean;
}

export interface AnalyzedCommand {
  /** Every effective simple command found — the top-level split plus every
   *  recursively-resolved wrapper payload, merged (never replacing the
   *  wrapper's own invocation, which is also included). */
  commands: EffectiveCommand[];
  /** True when a recognized wrapper's payload could not be statically
   *  resolved (a tainted or missing payload argument). Fail-closed for
   *  callers — never treated as "no covered action". */
  unresolvableShellPayload: boolean;
  /** True when wrapper recursion hit the bounded depth limit before fully
   *  resolving. Fail-closed for callers, same as above. */
  depthExceeded: boolean;
}

export interface ClassifiedCommand {
  /** Resolved executable: "git" for both the dispatcher form and any
   *  git-<sub> per-subcommand-binary form (basename equivalence); the
   *  resolved argv[0]'s basename for anything else ("gh", "curl", "bash",
   *  ...). */
  binary: string;
  /** The git subcommand this effective command invokes — resolved past
   *  leading env-assignment prefixes and git global options for the
   *  dispatcher form, or read directly off the git-<sub> basename for the
   *  per-subcommand-binary form. Null when `binary` is not "git", or when no
   *  subcommand token could be located at all. */
  gitSubcommand: string | null;
  /** Resolved argv AFTER the tokens that produced `binary`/`gitSubcommand`
   *  — what matchBenignPushGrammar and any verb-specific inspection
   *  (gh/curl/wget) consumes. */
  args: ArgvToken[];
  /** True when locating `binary`/`gitSubcommand` passed through a prefix or
   *  option the consumer MUST fail closed on: a leading shell env-assignment
   *  (NAME=VALUE), a `-c <k=v>` git config override, a tree/exec-path-
   *  redirecting global option, an unknown/ambiguous-arity global option, or
   *  a tainted binary/subcommand token. Never silently dropped — surfaced so
   *  the consumer applies its own ask/deny policy. */
  requiresFailClosed: boolean;
  /** The resolved directory when the ONLY git global option present is the
   *  exact, allow-eligible `-C {dir}` shape (a single, untainted, non-flag
   *  directory token immediately following one `-C`, with no other
   *  fail-closed-triggering option); null otherwise. */
  cDir: string | null;
  /** True only when the raw basename token that produced `binary` (and, for
   *  the per-subcommand-binary form, `gitSubcommand`) was ALREADY the exact,
   *  literal, lowercase canonical spelling with no `.exe` suffix — e.g. raw
   *  "git", not "GIT"/"Git"/"git.exe". `binary`/`gitSubcommand` are resolved
   *  case-insensitively and `.exe`-stripped for CLASSIFICATION (so a
   *  case-variant or `.exe`-suffixed invocation is still detected as
   *  covered), but reaching an `allow` decision requires this flag — a
   *  case-variant or `.exe` invocation is covered-shaped and can still be
   *  asked/denied, never silently allowed. */
  binaryCaseExact: boolean;
}

// ---------------------------------------------------------------------------
// Tokenizer — single linear scan, bounded recursion, no backtracking regex
// over the command body (no ReDoS). Mirrors normalizeLexicalNoise's
// bounded-scan discipline (hooks/ts/bodies/policy-block.ts) and
// shellSplit's quote-state-machine shape, extended with taint tracking and
// opaque command-substitution spans.
// ---------------------------------------------------------------------------

type SegmentOperator = "start" | ";" | "&&" | "||" | "&" | "|" | "\n";

interface RawSegment {
  argv: ArgvToken[];
  precedingOperator: SegmentOperator;
}

interface ScanState {
  segments: RawSegment[];
  argv: ArgvToken[];
  value: string;
  tainted: boolean;
  hasToken: boolean;
  pendingOp: SegmentOperator;
  inSQ: boolean;
  inDQ: boolean;
}

// Characters that are only special OUTSIDE any quote (glob/brace/tilde —
// none of these expand inside double quotes in bash, so they are only
// consulted from stepUnquoted, never from stepDoubleQuote).
const UNQUOTED_TAINT_CHARS = new Set(["{", "}", "*", "?", "[", "~"]);

function appendChar(state: ScanState, ch: string, taints: boolean): void {
  state.value += ch;
  state.hasToken = true;
  if (taints) state.tainted = true;
}

function pushToken(state: ScanState): void {
  if (!state.hasToken) return;
  state.argv.push({ value: state.value, tainted: state.tainted });
  state.value = "";
  state.tainted = false;
  state.hasToken = false;
}

function pushSegment(state: ScanState, nextOperator: SegmentOperator): void {
  pushToken(state);
  if (state.argv.length > 0) {
    state.segments.push({ argv: state.argv, precedingOperator: state.pendingOp });
  }
  state.argv = [];
  state.pendingOp = nextOperator;
}

function stepSingleQuote(cmd: string, i: number, state: ScanState): number {
  const ch = cmd[i];
  if (ch === "'") {
    state.inSQ = false;
    return i + 1;
  }
  appendChar(state, ch, false);
  return i + 1;
}

// Consumes an opaque `$(...)` command-substitution span atomically (so an
// embedded space cannot manufacture a false token boundary) with its own
// bounded quote/paren-depth tracking, WITHOUT ever evaluating its contents —
// the whole span is appended to the current token and marked tainted.
function consumeParenSubstitution(cmd: string, startI: number, state: ScanState): number {
  appendChar(state, "$", true);
  appendChar(state, "(", true);
  let i = startI + 2;
  let depth = 1;
  let sq = false;
  let dq = false;

  while (i < cmd.length && depth > 0) {
    const ch = cmd[i];
    if (sq) {
      appendChar(state, ch, false);
      if (ch === "'") sq = false;
      i++;
      continue;
    }
    if (dq) {
      if (ch === "\\" && i + 1 < cmd.length) {
        appendChar(state, ch, false);
        appendChar(state, cmd[i + 1], false);
        i += 2;
        continue;
      }
      appendChar(state, ch, false);
      if (ch === '"') dq = false;
      i++;
      continue;
    }
    if (ch === "'") sq = true;
    else if (ch === '"') dq = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    appendChar(state, ch, false);
    i++;
  }
  return i;
}

// Consumes an opaque backtick command-substitution span the same way —
// never evaluated, only bounded so its content cannot split the token.
function consumeBacktickSubstitution(cmd: string, startI: number, state: ScanState): number {
  appendChar(state, "`", true);
  let i = startI + 1;
  while (i < cmd.length && cmd[i] !== "`") {
    if (cmd[i] === "\\" && i + 1 < cmd.length) {
      appendChar(state, cmd[i], false);
      appendChar(state, cmd[i + 1], false);
      i += 2;
      continue;
    }
    appendChar(state, cmd[i], false);
    i++;
  }
  if (i < cmd.length) {
    appendChar(state, "`", false);
    i++;
  }
  return i;
}

// Inside double quotes only `$`/backtick still expand (glob/brace/tilde do
// not) — mirrors shellSplit's dquote escape rules (policy-block.ts).
function stepDoubleQuote(cmd: string, i: number, state: ScanState): number {
  const ch = cmd[i];
  if (ch === '"') {
    state.inDQ = false;
    return i + 1;
  }
  if (ch === "\\" && i + 1 < cmd.length) {
    const nc = cmd[i + 1];
    if (nc === '"' || nc === "\\" || nc === "$" || nc === "`") {
      appendChar(state, nc, false);
    } else {
      appendChar(state, "\\", false);
      appendChar(state, nc, false);
    }
    return i + 2;
  }
  if (ch === "$" && cmd[i + 1] === "(") return consumeParenSubstitution(cmd, i, state);
  if (ch === "`") return consumeBacktickSubstitution(cmd, i, state);
  if (ch === "$") {
    appendChar(state, ch, true);
    return i + 1;
  }
  appendChar(state, ch, false);
  return i + 1;
}

interface OperatorMatch {
  op: SegmentOperator;
  length: number;
}

const TWO_CHAR_OPERATORS: Array<[string, SegmentOperator]> = [
  ["&&", "&&"],
  ["||", "||"],
];
const ONE_CHAR_OPERATORS: Record<string, SegmentOperator> = {
  ";": ";",
  "\n": "\n",
  "&": "&",
  "|": "|",
};
// A bare, unquoted subshell parenthesis is treated as a plain command
// boundary — deliberately NOT recursed into as its own nested wrapper form
// (out of scope: no AC in this module exercises subshell recursion, and the
// design boundary favors minimal parsing surface over exhaustive shell
// semantics). The paren character itself is discarded.
const PAREN_BOUNDARY_CHARS = new Set(["(", ")"]);

function matchOperatorAt(cmd: string, i: number): OperatorMatch | null {
  for (const [token, op] of TWO_CHAR_OPERATORS) {
    if (cmd.startsWith(token, i)) return { op, length: token.length };
  }
  const ch = cmd[i];
  if (ch in ONE_CHAR_OPERATORS) return { op: ONE_CHAR_OPERATORS[ch], length: 1 };
  if (PAREN_BOUNDARY_CHARS.has(ch)) return { op: "start", length: 1 };
  return null;
}

function stepUnquoted(cmd: string, i: number, state: ScanState): number {
  const ch = cmd[i];

  if (ch === " " || ch === "\t" || ch === "\r") {
    pushToken(state);
    return i + 1;
  }

  const operator = matchOperatorAt(cmd, i);
  if (operator) {
    pushSegment(state, operator.op);
    return i + operator.length;
  }

  if (ch === "'") {
    state.inSQ = true;
    return i + 1;
  }
  if (ch === '"') {
    state.inDQ = true;
    return i + 1;
  }
  if (ch === "\\" && i + 1 < cmd.length) {
    appendChar(state, cmd[i + 1], false);
    return i + 2;
  }
  if (ch === "$" && cmd[i + 1] === "(") return consumeParenSubstitution(cmd, i, state);
  if (ch === "`") return consumeBacktickSubstitution(cmd, i, state);
  if (ch === "$") {
    appendChar(state, ch, true);
    return i + 1;
  }
  if (UNQUOTED_TAINT_CHARS.has(ch)) {
    appendChar(state, ch, true);
    return i + 1;
  }

  appendChar(state, ch, false);
  return i + 1;
}

// Splits `cmd` into top-level effective-command segments. Unbalanced quotes
// at end-of-string are fail-closed: the in-progress token is forced tainted
// rather than treated as a clean literal (its true value is ambiguous).
function scanCommand(cmd: string): RawSegment[] {
  const state: ScanState = {
    segments: [],
    argv: [],
    value: "",
    tainted: false,
    hasToken: false,
    pendingOp: "start",
    inSQ: false,
    inDQ: false,
  };

  let i = 0;
  while (i < cmd.length) {
    if (state.inSQ) i = stepSingleQuote(cmd, i, state);
    else if (state.inDQ) i = stepDoubleQuote(cmd, i, state);
    else i = stepUnquoted(cmd, i, state);
  }

  if (state.inSQ || state.inDQ) state.tainted = true;
  pushSegment(state, "start");
  return state.segments;
}

// ---------------------------------------------------------------------------
// Wrapper resolution — bounded recursion over the parsed structure (AC-1.2).
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DEPTH = 5;
const SHELL_BASENAMES = new Set([
  "bash", "sh", "zsh", "dash", "ksh", "su",
  "ash", "hush", "mksh", "tcsh", "csh", "fish",
]);
const SHELL_C_FLAG_RE = /^-[A-Za-z]*c[A-Za-z]*$/;

// The SAFE-exemption category the structural inversion is built on (see
// module header). Membership criterion (capability-based, falsifiable): a
// basename qualifies iff, per its authoritative documentation, it has NO
// mechanism to (a) execute a command or spawn an operator-chosen subprocess
// from any of its own argv arguments, (b) execute/evaluate stdin (or any
// input byte-stream) as a command or script, or (c) invoke an
// operator-named external program via any flag, builtin, environment
// variable, or interactive/input-triggered mechanism (e.g. a pager's
// `!`-escape or `$EDITOR`/`$PAGER` invocation). The test is the documented
// feature's EXISTENCE, never whether it is reachable in a given invocation
// context — when in doubt, exclude; a wrong exclusion only costs a
// fail-safe over-ask, never a bypass. File-write (`tee`, `ln`) does not
// disqualify — this analyzer's threat is command execution, not file
// targeting (a separate concern owned by policy-block's own rules).
// This is a small, closed, long-stable category by KIND — unlike the
// enumeration it replaces, it does not need a new entry every time a new
// wrapper/runner binary is invented; the tool only needs to genuinely pass
// the criterion above. Consumed both by the runner-prefix layer
// (classifyCoveredAction) and the pipe-to-shell receiver layer
// (detectPipeToShellPayload) — one list, two call sites, matching the
// module's existing single-normalization pattern.
const SAFE_NON_EXECUTING_BASENAMES = new Set([
  "grep", "egrep", "fgrep", "echo", "printf", "cat", "ls", "ln", "test", "[",
  "tee", "head", "tail", "wc", "uniq", "cut", "tr",
  "nl", "rev", "tac", "paste", "join", "column", "fold", "fmt", "pr",
  "diff", "cmp", "comm", "md5sum", "sha1sum", "sha256sum", "sha512sum",
  "base64", "xxd", "od", "hexdump", "strings", "file",
  "pwd", "true", "false",
]);

// Basenames already resolved by a DEDICATED, precise consumption model
// elsewhere in this module (shell `-c`/eval/xargs argument-templating
// semantics — detectSingleSegmentWrapperPayload; `env` via RUNNER_MODELS)
// are excluded from classifyCoveredAction's ambiguous-wrapper forward-scan
// below. Without this exclusion, a shell's OWN framing arguments and unused
// trailing positional parameters (`bash -c git push origin main` executes
// only the single-token script `git`; `push`/`origin`/`main` become $1/$2/$3,
// never part of what runs) would be misread as "git push" sitting right
// there in argv — a false positive the dedicated wrapper-payload extraction
// already gets right by construction.
const KNOWN_WRAPPER_BASENAMES = new Set<string>([...SHELL_BASENAMES, "eval", "xargs"]);

function lastPathSegment(value: string): string {
  const idx = value.lastIndexOf("/");
  return idx >= 0 ? value.slice(idx + 1) : value;
}

interface WrapperPayload {
  /** The statically-resolved literal payload string to recursively parse;
   *  null when the payload could not be statically resolved. */
  literal: string | null;
}

// Locates a `-c`-containing flag cluster (`-c`, `-lc`, `-xc`, ...) among a
// recognized shell's own argv and extracts the following token as the
// payload string. Returns null when this argv does not carry a `-c` cluster
// at all (not this wrapper shape).
function extractShellCPayload(argv: ArgvToken[]): WrapperPayload | null {
  for (let i = 1; i < argv.length; i++) {
    if (SHELL_C_FLAG_RE.test(argv[i].value)) {
      const payloadToken = argv[i + 1];
      if (!payloadToken) return { literal: null };
      return { literal: payloadToken.tainted ? null : payloadToken.value };
    }
  }
  return null;
}

// `eval <args>` re-evaluates its arguments joined by a space.
function extractEvalPayload(argv: ArgvToken[]): WrapperPayload {
  const rest = argv.slice(1);
  if (rest.length === 0 || rest.some((t) => t.tainted)) return { literal: null };
  return { literal: rest.map((t) => t.value).join(" ") };
}

// xargs's `-I<repl>`/`--replace[=<repl>]` declares a replacement-string
// placeholder (default `{}` when the flag carries no explicit value) that
// xargs substitutes with each input line AT RUN TIME — the literal
// placeholder text captured by the tokenizer is never the value that
// actually executes. Scans xargs's own argv (before the shell token) for the
// flag; returns the declared replacement string, or null when `-I`/
// `--replace` is not present at all (no placeholder substitution applies).
function extractXargsReplacementString(argv: ArgvToken[], shellIndex: number): string | null {
  for (let i = 1; i < shellIndex; i++) {
    const tok = argv[i].value;
    // `-I`'s replace-str is a MANDATORY argument (GNU getopt: may be glued
    // or supplied as the next token). `-i`/`--replace`'s replace-str is
    // OPTIONAL (GNU getopt: only recognized when glued directly to the
    // flag) — a bare `-i` or `--replace` with nothing glued defaults to
    // "{}" WITHOUT consuming the next token, which is a separate,
    // independent argument (real GNU xargs behavior; treating it as
    // consumed would misresolve a resolved literal as unresolvable in the
    // opposite direction — the same arity divergence the adversary report
    // flagged for bare `--replace`, closed here for both spellings).
    if (tok === "-I") return argv[i + 1]?.value ?? "{}";
    if (tok === "-i" || tok === "--replace") return "{}";
    if (tok.startsWith("--replace=")) return tok.slice("--replace=".length);
    if (tok.startsWith("-I") && tok.length > 2) return tok.slice(2);
    if (tok.startsWith("-i") && tok.length > 2) return tok.slice(2);
  }
  return null;
}

// `xargs … <shell> -c <str>` — locate a recognized shell basename anywhere
// in xargs's own argv and apply the same `-c` extraction to the tail
// starting at that shell. When xargs declares a replacement-string
// placeholder and the shell's own payload literal carries it, the payload is
// not a fixed script — it is a template xargs fills in per input line — so
// it resolves to unresolvable rather than being (mis)treated as the literal
// text of the placeholder itself.
function extractXargsPayload(argv: ArgvToken[]): WrapperPayload | null {
  for (let i = 1; i < argv.length; i++) {
    if (!SHELL_BASENAMES.has(lastPathSegment(argv[i].value))) continue;

    const shellPayload = extractShellCPayload(argv.slice(i)) ?? { literal: null };
    const replacement = extractXargsReplacementString(argv, i);
    if (replacement !== null && shellPayload.literal !== null && shellPayload.literal.includes(replacement)) {
      return { literal: null };
    }
    return shellPayload;
  }
  return null;
}

// `env -S`/`--split-string` re-splits its argument into a fresh argv and
// executes it directly (the shebang-line use case) — structurally the same
// "the argument IS a script" shape as a shell's `-c`, not an ordinary opaque
// value flag. Extracting it here, at the same wrapper-payload layer as
// extractShellCPayload, means the embedded command is recursively resolved
// (or marked unresolvable when tainted/absent) like every other wrapper
// payload — an instance of the general wrapper-payload contract rather than
// a runner-prefix-only special case (the runner-prefix
// skip in classifyCoveredAction still treats `-S`/`--split-string` as an
// opaque value flag for ITS OWN purpose of locating a real command that
// follows in the SAME argv; when nothing follows, that skip alone loses the
// embedded command entirely — this function is what recovers it).
function extractEnvSplitStringPayload(argv: ArgvToken[]): WrapperPayload | null {
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.value === "-S" || tok.value === "--split-string") {
      const payloadToken = argv[i + 1];
      if (!payloadToken) return { literal: null };
      return { literal: payloadToken.tainted ? null : payloadToken.value };
    }
    if (tok.value.startsWith("--split-string=")) {
      return { literal: tok.tainted ? null : tok.value.slice("--split-string=".length) };
    }
  }
  return null;
}

// Multi-call dispatcher conveying shell identity via its OWN ARGUMENT
// (`busybox sh -c`, `toybox ash -c`, or any future dispatcher — the
// dispatcher's own basename is never enumerated). Keyed on the structural
// signature "a recognized shell name at argv[1], followed somewhere by a
// `-c` cluster" — never on the presence of `-c` alone, which is heavily
// overloaded across unrelated tools (`tar -c`, `grep -c`, `gcc -c file.c`,
// `python -c`, `sort -c file`); none of those has a shell NAME at argv[1],
// so none fires. The `-c` cluster is located by scanning every position via
// extractShellCPayload rather than testing the fixed argv[2] slot, so an
// intervening shell flag before `-c` (`busybox sh -x -c "…"`) is still
// caught — a positional argv[2]-only test would miss it.
function detectDispatcherShellCPayload(argv: ArgvToken[]): WrapperPayload | null {
  if (argv.length < 3) return null;
  if (!SHELL_BASENAMES.has(canonicalBasename(argv[1].value))) return null;
  return extractShellCPayload(argv.slice(1));
}

function detectSingleSegmentWrapperPayload(argv: ArgvToken[]): WrapperPayload | null {
  if (argv.length === 0) return null;
  const basename = canonicalBasename(argv[0].value);
  if (SHELL_BASENAMES.has(basename)) return extractShellCPayload(argv);
  if (basename === "eval") return extractEvalPayload(argv);
  if (basename === "xargs") return extractXargsPayload(argv);
  if (basename === "env") return extractEnvSplitStringPayload(argv);
  if (!SAFE_NON_EXECUTING_BASENAMES.has(basename)) {
    const dispatcherPayload = detectDispatcherShellCPayload(argv);
    if (dispatcherPayload !== null) return dispatcherPayload;
  }
  return null;
}

// A producer piped into a bare shell invocation (no `-c`, so the shell reads
// its script from stdin) is a wrapper regardless of WHICH producer supplies
// the payload — `curl … | bash`, `wget … | sh`, `$SOMEVAR | bash` are all the
// same shape as `echo <lit> | bash`. Only a literal `echo`/`printf` producer
// is statically resolvable; every other producer's output cannot be known
// ahead of execution, so it resolves to an unresolvable payload (fail-closed)
// rather than silently falling through as "no covered action" — this is what
// closes AC-2.6's own named example (`curl https://x | bash`).
function detectPipeToShellPayload(first: ArgvToken[], second: ArgvToken[]): WrapperPayload | null {
  if (first.length === 0 || second.length === 0) return null;
  // Structural default (see module header): the receiving side is treated
  // as a POTENTIAL shell/wrapper unless its basename is affirmatively known
  // to never interpret stdin as a script — a fixed 6-name shell-basename
  // membership test misses a multi-call binary that conveys its shell
  // identity via ITS OWN ARGUMENT rather than argv[0] (`busybox sh`,
  // `toybox ash`), an aliased/symlinked shell, or anything not yet invented.
  if (SAFE_NON_EXECUTING_BASENAMES.has(canonicalBasename(second[0].value))) return null;
  // A shell invoked with its own `-c` cluster reads its script from that
  // argument, not from stdin — that is the extractShellCPayload wrapper
  // shape (detectSingleSegmentWrapperPayload), not a pipe-to-shell.
  if (extractShellCPayload(second) !== null) return null;

  const firstBasename = lastPathSegment(first[0].value);
  if (firstBasename !== "echo" && firstBasename !== "printf") return { literal: null };

  const literalArgs = first.slice(1).filter((t) => !t.value.startsWith("-"));
  if (literalArgs.some((t) => t.tainted)) return { literal: null };
  return { literal: literalArgs.map((t) => t.value).join(" ") };
}

function toEffectiveCommand(argv: ArgvToken[]): EffectiveCommand {
  return { argv, tainted: argv.some((t) => t.tainted) };
}

interface WrapperResolution {
  commands: EffectiveCommand[];
  unresolvable: boolean;
  depthExceeded: boolean;
}

function mergeWrapperPayload(payload: WrapperPayload, depth: number, maxDepth: number): WrapperResolution {
  if (payload.literal === null) return { commands: [], unresolvable: true, depthExceeded: false };
  if (depth >= maxDepth) return { commands: [], unresolvable: false, depthExceeded: true };

  const inner = analyzeCommandAtDepth(payload.literal, depth + 1, maxDepth);
  return {
    commands: inner.commands,
    unresolvable: inner.unresolvableShellPayload,
    depthExceeded: inner.depthExceeded,
  };
}

function resolveSegments(rawSegments: RawSegment[], depth: number, maxDepth: number): AnalyzedCommand {
  const commands: EffectiveCommand[] = [];
  let unresolvableShellPayload = false;
  let depthExceeded = false;

  const absorb = (result: WrapperResolution): void => {
    commands.push(...result.commands);
    unresolvableShellPayload = unresolvableShellPayload || result.unresolvable;
    depthExceeded = depthExceeded || result.depthExceeded;
  };

  let i = 0;
  while (i < rawSegments.length) {
    const seg = rawSegments[i];
    commands.push(toEffectiveCommand(seg.argv));

    const next = rawSegments[i + 1];
    if (next && next.precedingOperator === "|") {
      const pipePayload = detectPipeToShellPayload(seg.argv, next.argv);
      if (pipePayload !== null) {
        commands.push(toEffectiveCommand(next.argv));
        absorb(mergeWrapperPayload(pipePayload, depth, maxDepth));
        i += 2;
        continue;
      }
    }

    const payload = detectSingleSegmentWrapperPayload(seg.argv);
    if (payload !== null) absorb(mergeWrapperPayload(payload, depth, maxDepth));

    i++;
  }

  return { commands, unresolvableShellPayload, depthExceeded };
}

function analyzeCommandAtDepth(cmd: string, depth: number, maxDepth: number): AnalyzedCommand {
  return resolveSegments(scanCommand(cmd), depth, maxDepth);
}

// ---------------------------------------------------------------------------
// Public entry point — tokenize, resolve structure, recursively unwrap
// command-executing wrappers up to `maxDepth` (bounded, default 5; AC-1.5
// requires only that the bound be >= 3).
// ---------------------------------------------------------------------------

export function analyzeCommand(cmd: string, maxDepth: number = DEFAULT_MAX_DEPTH): AnalyzedCommand {
  return analyzeCommandAtDepth(cmd, 0, maxDepth);
}

// ---------------------------------------------------------------------------
// classifyCoveredAction — basename equivalence + git argv[0]/subcommand
// resolution (AC-1.3, AC-1.7).
// ---------------------------------------------------------------------------

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function isEnvAssignmentToken(token: ArgvToken): boolean {
  return ENV_ASSIGNMENT_RE.test(token.value);
}

// git global options this module models at their real, fixed arity — see
// module header. Booleans consume no following token; `-C`/`-c` consume the
// next token; the long tree/exec-path-redirecting options accept either a
// glued `=value` or a following token.
const GIT_BOOLEAN_GLOBAL_OPTIONS = new Set(["-p", "--paginate", "--no-pager"]);
const GIT_TREE_REDIRECT_OPTIONS = new Set(["--git-dir", "--work-tree", "--namespace", "--exec-path"]);

interface GitGlobalScan {
  /** Index into argv of the resolved subcommand token, or -1 when none was
   *  found (only global options/flags present). */
  subcommandIndex: number;
  requiresFailClosed: boolean;
  cDir: string | null;
}

// A single, untainted, non-flag directory token immediately following one
// `-C` is the only allow-eligible shape (AC-1.7(a)); a repeated `-C`, a
// missing/tainted/flag-shaped directory token all fail closed instead.
function resolveCDirToken(argv: ArgvToken[], index: number, alreadySeen: boolean): { cDir: string | null; failClosed: boolean } {
  const dirTok = argv[index + 1];
  if (!alreadySeen && dirTok && !dirTok.tainted && !dirTok.value.startsWith("-")) {
    return { cDir: dirTok.value, failClosed: false };
  }
  return { cDir: null, failClosed: true };
}

interface GitOptionStep {
  advance: number;
  failClosed: boolean;
  cDir: string | null;
}

// Classifies ONE leading git global-option token at its real, fixed arity
// (AC-1.7) — booleans consume no value, `-C`/`-c` always consume the next
// token, the long tree/exec-path options accept `=value` glued or spaced.
// Only `-p`/`--paginate`/`--no-pager` and an exact, untainted `-C {dir}` are
// allow-eligible; everything else sets failClosed.
function stepGitGlobalOption(argv: ArgvToken[], i: number, cDirSeen: boolean): GitOptionStep {
  const tok = argv[i];
  if (tok.tainted) return { advance: 1, failClosed: true, cDir: null };
  if (GIT_BOOLEAN_GLOBAL_OPTIONS.has(tok.value)) return { advance: 1, failClosed: false, cDir: null };
  if (tok.value === "-C") {
    const resolved = resolveCDirToken(argv, i, cDirSeen);
    return { advance: 2, failClosed: resolved.failClosed, cDir: resolved.cDir };
  }
  if (tok.value === "-c") return { advance: 2, failClosed: true, cDir: null };

  // Tree/exec-path redirect, or unknown/ambiguous-arity option (AC-1.7(d)).
  const eqIdx = tok.value.indexOf("=");
  const optName = eqIdx >= 0 ? tok.value.slice(0, eqIdx) : tok.value;
  const advance = GIT_TREE_REDIRECT_OPTIONS.has(optName) && eqIdx < 0 ? 2 : 1;
  return { advance, failClosed: true, cDir: null };
}

// Resolves git's leading global options purely to LOCATE the subcommand
// token — never to authorize an allow (see stepGitGlobalOption).
function scanGitGlobalOptions(argv: ArgvToken[], start: number): GitGlobalScan {
  let i = start;
  let requiresFailClosed = false;
  let cDir: string | null = null;
  let cDirSeen = false;

  while (i < argv.length && argv[i].value.startsWith("-")) {
    const step = stepGitGlobalOption(argv, i, cDirSeen);
    if (step.cDir !== null) {
      cDir = step.cDir;
      cDirSeen = true;
    }
    requiresFailClosed = requiresFailClosed || step.failClosed;
    i += step.advance;
  }

  return { subcommandIndex: i < argv.length ? i : -1, requiresFailClosed, cDir: requiresFailClosed ? null : cDir };
}

const GIT_DISPATCHER_PREFIX = "git-";

// `canonicalBasename` is what closes the CASE-VARIANT / `.exe` binary
// resolution gap (a `GIT`/`Git`/`git.exe` invocation on a case-insensitive
// filesystem still executes `git`, and classification must key on what
// actually executes) — resolved ONCE here, so `basename === "git"` (the
// dispatcher check), the `git-` dispatcher-prefix check, and the
// command-runner-prefix check below all share one normalization instead of
// each hook re-implementing its own partial fallback (the failure mode three
// independent reviewers found from three different angles).
function stripExeSuffix(basename: string): string {
  return /\.exe$/i.test(basename) ? basename.slice(0, -4) : basename;
}

function canonicalBasename(rawValue: string): string {
  return stripExeSuffix(lastPathSegment(rawValue)).toLowerCase();
}

// canonicalBasename with `.exe` stripped but ORIGINAL case preserved — used
// to (a) slice a per-subcommand-binary's subcommand text at its real case
// (`Git-Push` -> subcommand "Push", not "push") and (b) determine
// `binaryCaseExact` (whether the raw token was ALREADY the canonical
// lowercase spelling, no `.exe`).
function basenameNoExe(rawValue: string): string {
  return stripExeSuffix(lastPathSegment(rawValue));
}

// canonicalBasename() is case-insensitive on the "git-" prefix; the
// subcommand text itself is sliced from the case-preserved `rawNoExe` at the
// same offset (ASCII case-folding never changes string length), so a
// case-variant dispatcher form (`Git-Push`, `GIT-PUSH.exe`) is still
// detected AND still carries the subcommand's original case for the
// caller's own exact-match comparisons.
function extractGitDispatcherSubcommand(canonical: string, rawNoExe: string): string | null {
  if (!canonical.startsWith(GIT_DISPATCHER_PREFIX)) return null;
  const sub = rawNoExe.slice(GIT_DISPATCHER_PREFIX.length);
  return sub.length > 0 ? sub : null;
}

function classifyGitDispatcher(
  argv: ArgvToken[],
  afterBinary: number,
  prefixFailClosed: boolean
): Omit<ClassifiedCommand, "binaryCaseExact"> {
  const scan = scanGitGlobalOptions(argv, afterBinary);
  const requiresFailClosed = prefixFailClosed || scan.requiresFailClosed;

  if (scan.subcommandIndex < 0) {
    return { binary: "git", gitSubcommand: null, args: [], requiresFailClosed, cDir: requiresFailClosed ? null : scan.cDir };
  }

  const subTok = argv[scan.subcommandIndex];
  return {
    binary: "git",
    gitSubcommand: subTok.value,
    args: argv.slice(scan.subcommandIndex + 1),
    requiresFailClosed: requiresFailClosed || subTok.tainted,
    cDir: requiresFailClosed ? null : scan.cDir,
  };
}

// ---------------------------------------------------------------------------
// Command-runner prefixes (`env`, `timeout`, `nice`, `nohup`, `command`,
// `stdbuf`, `setsid`, `time`, `sudo`, `doas`) — a closed set of tools whose
// entire purpose is to invoke another command, so a covered action prefixed
// by one of these must still classify on the REAL command, not the runner's
// own basename (`env git push origin main` was previously classified as
// binary "env" — not "git" — and so reached no covered-action check at
// all). Modeled the same way the env-assignment prefix loop resolves past
// `NAME=VALUE`: skip the runner's own recognized option grammar (a small,
// per-tool value-consuming-flag set; an unrecognized flag defaults to
// boolean, i.e. consumes no value) plus, for `timeout` only, its one
// mandatory DURATION positional — then continue resolving from there. A
// runner prefix ALWAYS sets `requiresFailClosed`: even when the true command
// is located, the runner's own arguments are not modeled precisely enough
// (glued short options, tool-specific edge cases) to trust an `allow`.
// ---------------------------------------------------------------------------

interface RunnerModel {
  /** Flag names (bare, no `=value`) that consume the NEXT token as their
   *  value; every other `-`-prefixed token is treated as boolean (consumes
   *  no value) — the safer default when a flag's arity is not modeled. */
  valueFlags: Set<string>;
  /** Mandatory non-flag positional(s) the runner itself requires BEFORE the
   *  command (only `timeout`'s DURATION; every other modeled runner invokes
   *  the command directly after its own options). */
  extraPositionals: number;
}

const RUNNER_MODELS: Record<string, RunnerModel> = {
  env: { valueFlags: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]), extraPositionals: 0 },
  timeout: { valueFlags: new Set(["-k", "--kill-after", "-s", "--signal"]), extraPositionals: 1 },
  nice: { valueFlags: new Set(["-n", "--adjustment"]), extraPositionals: 0 },
  nohup: { valueFlags: new Set(), extraPositionals: 0 },
  command: { valueFlags: new Set(), extraPositionals: 0 },
  stdbuf: { valueFlags: new Set(["-i", "--input", "-o", "--output", "-e", "--error"]), extraPositionals: 0 },
  setsid: { valueFlags: new Set(), extraPositionals: 0 },
  time: { valueFlags: new Set(["-o", "--output"]), extraPositionals: 0 },
  sudo: {
    valueFlags: new Set([
      "-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt",
      "-r", "--role", "-t", "--type", "-C", "--close-from",
    ]),
    extraPositionals: 0,
  },
  doas: { valueFlags: new Set(["-C", "-u"]), extraPositionals: 0 },
};

// Skips past the runner's own flags (value-consuming per RunnerModel, or
// boolean by default), an optional `--` end-of-options marker, the runner's
// mandatory extra positional(s) (timeout's DURATION), and any leading
// env-assignment tokens for the wrapped command (`env FOO=bar cmd`) — purely
// to LOCATE the real command, same non-authorizing spirit as
// scanGitGlobalOptions.
function skipRunnerPrefix(argv: ArgvToken[], start: number, model: RunnerModel): number {
  let idx = start;
  while (idx < argv.length && argv[idx].value.startsWith("-") && argv[idx].value !== "--") {
    const tok = argv[idx].value;
    const eqIdx = tok.indexOf("=");
    const name = eqIdx >= 0 ? tok.slice(0, eqIdx) : tok;
    idx += model.valueFlags.has(name) && eqIdx < 0 ? 2 : 1;
  }
  if (idx < argv.length && argv[idx].value === "--") idx++;
  idx += model.extraPositionals;
  while (idx < argv.length && isEnvAssignmentToken(argv[idx])) idx++;
  return idx;
}

// Resolves argv[0]'s basename (last `/`-segment, inspected regardless of
// taint — AC-1.3: a dynamic directory PREFIX in a token like
// `$(git --exec-path)/git-push` does not defeat the literal basename SUFFIX)
// past any leading shell env-assignment prefixes and command-runner
// prefixes, then either walks git's own global-option grammar (dispatcher
// form) or reads the subcommand straight off a `git-<sub>` basename
// (per-subcommand-binary form) — both classify identically by construction,
// case-insensitively and `.exe`-stripped (see canonicalBasename).
// Builds the final classification once argv[0]'s basename is located (index
// `afterBinary` is the first token AFTER it) — the dispatcher form, the
// `git-<sub>` per-subcommand-binary form, and every other binary each
// resolve their own `ClassifiedCommand` shape, but share the same
// `binaryCaseExact` contract (exact-case, no `.exe`). `noExeSuffixPresent`
// (whether the raw basename, BEFORE `.exe` was stripped, is unchanged by
// that stripping) gates every branch — `rawNoExe` alone cannot tell the
// caller apart from `git.exe`/`gh.exe`/`git-push.exe`, since the suffix is
// already gone by the time `rawNoExe` is computed.
// Phase-boundary DTO: everything classifyCoveredAction resolved about the
// leading binary before building the final result. A single-object
// parameter (over the 6 discrete parameters this replaces) keeps the
// builder under the 4-parameter reviewability cap with zero behavioral
// change — every field name and value is unchanged from the prior call.
interface ResolvedLeadingBinary {
  argv: ArgvToken[];
  /** Index of the first token AFTER the resolved leading binary. */
  afterBinary: number;
  /** Lowercased, `.exe`-stripped basename. */
  canonical: string;
  /** `.exe`-stripped basename, case preserved. */
  rawNoExe: string;
  /** Accumulated from the prefix scan (env-assignment/runner-prefix/taint). */
  requiresFailClosed: boolean;
  /** Whether the raw basename, before `.exe` was stripped, was unchanged. */
  noExeSuffixPresent: boolean;
}

function buildClassifiedResult(resolved: ResolvedLeadingBinary): ClassifiedCommand {
  const { argv, afterBinary, canonical, rawNoExe, requiresFailClosed, noExeSuffixPresent } = resolved;

  if (canonical === "git") {
    const classified = classifyGitDispatcher(argv, afterBinary, requiresFailClosed);
    return { ...classified, binaryCaseExact: noExeSuffixPresent && rawNoExe === "git" };
  }

  const dispatcherSub = extractGitDispatcherSubcommand(canonical, rawNoExe);
  if (dispatcherSub !== null) {
    return {
      binary: "git",
      gitSubcommand: dispatcherSub,
      args: argv.slice(afterBinary),
      requiresFailClosed,
      cDir: null,
      binaryCaseExact: noExeSuffixPresent && rawNoExe.startsWith(GIT_DISPATCHER_PREFIX),
    };
  }

  return {
    binary: canonical,
    gitSubcommand: null,
    args: argv.slice(afterBinary),
    requiresFailClosed,
    cDir: null,
    binaryCaseExact: noExeSuffixPresent && rawNoExe === canonical,
  };
}

// A located git/gh signal token, found strictly AFTER an unrecognized
// leading binary — see scanForGitGhSignal.
interface ForwardGitGhMatch {
  index: number;
  binary: "git" | "gh";
  /** Non-null when the match is the git-<sub> per-subcommand-binary
   *  dispatcher form (subcommand read straight off the basename); null for
   *  a bare `git`/`gh` token (subcommand, if any, resolved normally from
   *  the tokens that follow). */
  dispatcherSub: string | null;
}

// Scans argv strictly AFTER an unrecognized leading token for a LATER token
// that is itself a git/gh invocation — bare basename or the git-<sub>
// per-subcommand-binary dispatcher form, inspected the SAME
// case-insensitive/`.exe`-stripped way as the leading-position check,
// regardless of taint (AC-1.3's basename-SUFFIX rule). This is the
// mechanism that closes an UNENUMERATED runner/wrapper prefix by
// construction: any leading binary this module does not otherwise
// recognize is treated as a possible wrapper, not assumed harmless because
// its name has not been reported yet.
function scanForGitGhSignal(argv: ArgvToken[], start: number): ForwardGitGhMatch | null {
  for (let j = start; j < argv.length; j++) {
    const raw = argv[j].value;
    const canon = canonicalBasename(raw);
    if (canon === "git") return { index: j, binary: "git", dispatcherSub: null };
    if (canon === "gh") return { index: j, binary: "gh", dispatcherSub: null };
    const dispatcherSub = extractGitDispatcherSubcommand(canon, basenameNoExe(raw));
    if (dispatcherSub !== null) return { index: j, binary: "git", dispatcherSub };
  }
  return null;
}

// Builds the classification once scanForGitGhSignal locates a git/gh signal
// behind an unrecognized leading binary. `requiresFailClosed` is
// unconditionally true and `binaryCaseExact` is unconditionally false — an
// unenumerated wrapper's own argument grammar is never modeled precisely
// enough to trust an `allow`, mirroring the existing RUNNER_MODELS contract
// (a runner prefix is resolved past to locate the real command, never to
// authorize one).
function buildAmbiguousWrapperResult(argv: ArgvToken[], match: ForwardGitGhMatch): ClassifiedCommand {
  if (match.dispatcherSub !== null) {
    return {
      binary: "git",
      gitSubcommand: match.dispatcherSub,
      args: argv.slice(match.index + 1),
      requiresFailClosed: true,
      cDir: null,
      binaryCaseExact: false,
    };
  }
  if (match.binary === "git") {
    const classified = classifyGitDispatcher(argv, match.index + 1, true);
    return { ...classified, binaryCaseExact: false };
  }
  return {
    binary: "gh",
    gitSubcommand: null,
    args: argv.slice(match.index + 1),
    requiresFailClosed: true,
    cDir: null,
    binaryCaseExact: false,
  };
}

export function classifyCoveredAction(cmd: EffectiveCommand): ClassifiedCommand | null {
  const argv = cmd.argv;
  let i = 0;
  let requiresFailClosed = false;

  for (;;) {
    if (i >= argv.length) return null;
    if (isEnvAssignmentToken(argv[i])) {
      requiresFailClosed = true;
      i++;
      continue;
    }
    const model = RUNNER_MODELS[canonicalBasename(argv[i].value)];
    if (!model) break;
    requiresFailClosed = true;
    i = skipRunnerPrefix(argv, i + 1, model);
  }
  if (i >= argv.length) return null;

  const binaryTok = argv[i];
  const rawWithExe = lastPathSegment(binaryTok.value);
  const rawNoExe = stripExeSuffix(rawWithExe);
  const canonical = rawNoExe.toLowerCase();

  // Structural default (see module header): the leading token here is
  // either a direct git/gh invocation (handled below, unaffected) or one of
  // the small set of affirmatively safe, never-executing utilities — anyone
  // else is an UNRECOGNIZED potential wrapper and is checked for a git/gh
  // signal anywhere in its own remaining argv before being classified as an
  // ordinary, uncovered binary.
  const isDirectGitForm = canonical === "git" || extractGitDispatcherSubcommand(canonical, rawNoExe) !== null;
  if (!isDirectGitForm && !SAFE_NON_EXECUTING_BASENAMES.has(canonical) && !KNOWN_WRAPPER_BASENAMES.has(canonical)) {
    const match = scanForGitGhSignal(argv, i + 1);
    if (match !== null) return buildAmbiguousWrapperResult(argv, match);
  }

  if (binaryTok.tainted) requiresFailClosed = true;

  return buildClassifiedResult({
    argv,
    afterBinary: i + 1,
    canonical,
    rawNoExe,
    requiresFailClosed,
    noExeSuffixPresent: rawWithExe === rawNoExe,
  });
}

// ---------------------------------------------------------------------------
// Force-push detection — closed positive grammar (Invariant G), now
// consuming resolved argv + taint instead of a raw-string character gate.
//
// Replaces a character-denylist that was defeated three times by three
// different shell token-reconstruction techniques (whole-token quoting,
// mid-token quote-splicing, brace expansion / backtick substitution). A
// denylist enumerates bad characters; this enumerates nothing. It permits
// ONLY the exact benign push shape — every token resolved and untainted,
// benign flags only, and a destination that is both a plain branch name AND
// not ref-namespace-qualified (see isPlainBranchDestination) — and denies
// every deviation from that one shape, so an obfuscation technique this
// module's author never considered still lands on the deny side — because
// it is not the one permitted shape, not because it was specifically
// detected.
//
// Honest scope (G-2): this reasons about what the argv the analyzer could
// statically resolve expresses, not runtime config/environment. A `git`
// alias, a shadowing binary earlier on PATH, `push.default`/
// `remote.origin.push` git config, or a `GIT_*` environment override are out
// of scope by design — an attacker with any of those already has code
// execution in the session and does not need to smuggle anything through a
// git command string.
// ---------------------------------------------------------------------------

// The only characters a literal, non-reconstructable command string may
// contain. Retained for the recognizers/callers that still find a whole-
// command char-gate a useful defense-in-depth signal (see dev-guard.ts).
const SAFE_COMMAND_CHAR_RE = /^[A-Za-z0-9 _./-]*$/;

// Total precondition when used: must be checked, and must pass, before any
// classification branch that relies on it runs.
export function isLiteralSafeCommand(cmd: string): boolean {
  return SAFE_COMMAND_CHAR_RE.test(cmd);
}

// The closed allowlist of flags that do not disqualify a push from the
// benign form.
const BENIGN_PUSH_FLAG_RE = /^(-u|--set-upstream|-v|--verbose|--progress)$/;

export function isBenignPushFlag(token: string): boolean {
  return BENIGN_PUSH_FLAG_RE.test(token);
}

// The leading character class `[A-Za-z0-9._]` excludes `-`, which is the
// sub-rule that closes the CWE-88 dash-prefixed-positional case: a token
// starting with `-` (e.g. `-f`, `--delete`) can never itself pass as this
// recognizer's branch-name positional, regardless of what follows the dash.
// MUST NOT be loosened.
const PLAIN_BRANCH_NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

export function isPlainBranchName(token: string): boolean {
  return PLAIN_BRANCH_NAME_RE.test(token);
}

// Ref-namespace words that disqualify a destination's first `/`-segment,
// checked case-insensitively — tells a qualified/abbreviated ref form
// (`refs/heads/main`, `heads/main`, `REFS/HEADS/main`) apart from an actual
// branch name (`feature/my-branch` is unaffected: its first segment is not a
// reserved word).
const REF_NAMESPACE_WORDS = new Set(["refs", "heads", "tags", "remotes"]);

export function isPlainBranchDestination(dst: string): boolean {
  if (!isPlainBranchName(dst)) return false;
  const firstSegment = dst.split("/")[0].toLowerCase();
  return !REF_NAMESPACE_WORDS.has(firstSegment);
}

export interface MatchBenignPushGrammarResult {
  matched: boolean;
  /** The resolved destination branch when `matched` is true; null
   *  otherwise. The caller (dev-guard.ts) applies its own default-branch
   *  ask-floor to this value — a grammar match never authorizes an allow by
   *  itself. */
  destination: string | null;
}

/** Resolves HEAD/@ to the current branch name; null on any error or when
 *  unavailable. Deliberately minimal — command-lexer.ts is a lower-level
 *  shared module and does not depend on any hook's own reader type; a hook's
 *  reader (e.g. dev-guard.ts's DevGuardReader) satisfies this shape
 *  structurally. */
export interface PushGrammarReader {
  gitCurrentBranch(): string | null;
}

// Tag-literal destination heuristic: `git push origin v1.2.3` is a tag push
// even without `refs/tags/` or `--tags`.
const TAG_LIKE_RE = /^[vV]?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$/;

// Splits a refspec on the LAST colon. An empty SOURCE side (`:dst`) is a
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

function resolveSymbolicDestination(rawDst: string, reader: PushGrammarReader): string | null {
  if (rawDst === "HEAD" || rawDst === "@") return reader.gitCurrentBranch();
  if (rawDst.startsWith("@")) return null;
  return rawDst;
}

// The one benign closed form: `git push [benign-flags...] origin
// <plain-branch>`, where <plain-branch> is NOT ref-namespace-qualified. The
// `origin <plain-branch>` positional pair is REQUIRED (G-3) — a bare `git
// push` or `git push origin` (no refspec) is the only shape that consults
// `push.default`/`remote.origin.push`, so it is treated as not-benign rather
// than silently deferring to that config.
export function matchBenignPushGrammar(
  argv: string[],
  tainted: boolean[],
  reader: PushGrammarReader
): MatchBenignPushGrammarResult {
  const notMatched: MatchBenignPushGrammarResult = { matched: false, destination: null };
  if (tainted.some(Boolean)) return notMatched;

  const flagTokens = argv.filter((t) => t.startsWith("-"));
  const positionals = argv.filter((t) => !t.startsWith("-"));

  if (!flagTokens.every(isBenignPushFlag)) return notMatched;
  if (positionals.length !== 2) return notMatched;
  if (positionals[0] !== "origin") return notMatched;

  const refspec = positionals[1];
  if (refspec.startsWith("+")) return notMatched;

  const rawDst = extractRawDestination(refspec);
  if (rawDst === null) return notMatched;
  if (TAG_LIKE_RE.test(rawDst)) return notMatched;

  const dst = resolveSymbolicDestination(rawDst, reader);
  if (dst === null || !isPlainBranchDestination(dst)) return notMatched;

  return { matched: true, destination: dst };
}
