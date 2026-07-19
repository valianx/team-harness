// hooks/ts/bodies/command-lexer.ts
// Shared pre-pass for hooks/ts/bodies/dev-guard.ts and hooks/ts/bodies/
// gate-guard.ts — see agents/_shared/gate-contract.md and 01-plan.md § Task-8
// (Invariant F). Single source of truth: bundled into BOTH .cjs artifacts by
// esbuild, never imported at .cjs-to-.cjs runtime (parity with
// entry/*.ts importing CONTROL_CHAR_RE from bodies/prepublish-guard.ts).
//
// Problem this closes: every covered-action router in dev-guard.ts/
// gate-guard.ts uses a boundary-character class (`^|[\s|;&<>()\`]`) to decide
// where a command "starts". That class includes `|`, so a covered-action
// literal that sits INERT inside a quoted string — e.g. a read-only
// `grep "git push|gh pr merge" file` — satisfies the boundary and trips the
// router even though nothing executes. `prepareRoutableCommand` blanks the
// CONTENTS of quoted spans (keeping the quote characters and everything
// outside them, so the transformed string is the same length) before the
// callers' routers run their `.test()` calls, so an inert quoted literal no
// longer matches.
//
// Fail-closed invariant (non-negotiable, operator-mandated): blanking is
// applied ONLY when the command contains no command-executing wrapper and
// has balanced, parseable quotes. Any wrapper below, or any unbalanced/
// unparseable quoting, skips blanking entirely and returns the command
// UNCHANGED — whatever a router does with the raw command today is exactly
// what it still does. Over-detecting a wrapper only costs a redundant
// ask/deny it would already produce; under-detecting one would let an
// inert-looking blank hide a real invocation, which this design refuses to
// risk.
//
// Wrapper/ambiguity list (a floor, not a ceiling — see module comments below
// for the additions beyond the operator's named minimum):
//   - shell -c forms: bash/sh/zsh/dash/ksh/su with any flag token containing
//     `c` (covers `-c`, combined forms like `-lc`/`-xc`/`-icx`)
//   - eval
//   - xargs
//   - command substitution: $(...) or backticks
//   - pipe-to-shell: `... | bash` / `sh` / `zsh` / etc.
//   - process substitution: <(...) or >(...)
//   - ssh (a remote command argument is evaluated by a shell on the far end)
//   - unbalanced or unparseable quoting
//
// KNOWN, DOCUMENTED, OUT-OF-SCOPE RESIDUAL: none of the above closes the case
// where the wrapper's inner command IS the covered action (e.g.
// `bash -c "git push origin main"`). The router's boundary-character class
// does not treat a quote character as a boundary, so that inner literal
// already escapes detection today, with or without this module — this
// pre-pass deliberately does not detect whether a wrapper will itself execute
// a quoted covered-action literal; that case falls back to today's raw
// matching, unchanged. This is a known, tracked limitation — see the
// implementation record for the full characterization.

export interface PrepareRoutableCommandResult {
  /** The string callers should feed to their covered-action routers'
   *  `.test()` calls. Equal to the original `cmd` whenever blanking did not
   *  apply (wrapper detected, or quotes unbalanced/absent). */
  routable: string;
  /** True only when at least one quoted span's contents were actually
   *  replaced with filler. */
  blanked: boolean;
}

// A single, repeated, boundary-neutral filler character. It must not be a
// member of any router's boundary-character classes
// (`[\s|;&<>()\`"'$]`) so a blanked span cannot itself manufacture a new
// boundary; a plain ASCII letter is a safe, unremarkable choice.
const FILLER_CHAR = "x";

// ---------------------------------------------------------------------------
// Wrapper/ambiguity detection — run against the ORIGINAL, unblanked command.
// Deliberately broad: a false-positive wrapper detection only costs a
// redundant fallback to today's raw-match behavior, never a missed one.
// ---------------------------------------------------------------------------

// bash/sh/zsh/dash/ksh/su invoked with any flag token that contains the
// letter `c` — covers the bare `-c` form and every combined-flag spelling
// (`-lc`, `-xc`, `-icx`, ...) real shells accept for "run this string".
const SHELL_DASH_C_RE = /\b(?:bash|sh|zsh|dash|ksh|su)\s+-[a-zA-Z]*c[a-zA-Z]*(?:\s|$)/i;

const EVAL_RE = /(^|[\s;&|<>()`])eval(\s|$)/i;
const XARGS_RE = /(^|[\s;&|<>()`])xargs(\s|$)/i;
const COMMAND_SUBSTITUTION_RE = /\$\(|`/;
const PROCESS_SUBSTITUTION_RE = /[<>]\(/;
const PIPE_TO_SHELL_RE = /\|\s*(?:\S*\/)?(?:bash|sh|zsh|dash|ksh)(?:\s|$)/i;
// Defensive addition beyond the operator's named minimum (constraint #2
// explicitly invites this): ssh hands its command argument to a shell on the
// remote host, the same execution-context ambiguity as the local wrappers
// above.
const SSH_RE = /(^|[\s;&|<>()`])ssh(\s|$)/i;

function hasCommandExecutingWrapper(cmd: string): boolean {
  return (
    SHELL_DASH_C_RE.test(cmd) ||
    EVAL_RE.test(cmd) ||
    XARGS_RE.test(cmd) ||
    COMMAND_SUBSTITUTION_RE.test(cmd) ||
    PROCESS_SUBSTITUTION_RE.test(cmd) ||
    PIPE_TO_SHELL_RE.test(cmd) ||
    SSH_RE.test(cmd)
  );
}

// ---------------------------------------------------------------------------
// Quote analysis — a minimal POSIX-shell-shaped quote lexer. Single quotes
// have no escaping at all (everything until the next `'` is literal);
// double quotes honor a backslash as escaping the next character. A
// backslash outside any quote also escapes the next character. Reaching the
// end of the command still inside a quote means the quoting is unbalanced.
// ---------------------------------------------------------------------------

interface QuoteSpan {
  /** Index of the first content character (just after the opening quote). */
  start: number;
  /** Index just past the last content character (the closing quote's index). */
  end: number;
}

interface QuoteAnalysis {
  balanced: boolean;
  spans: QuoteSpan[];
}

// Mutable scan state threaded through the three per-context step functions
// below. `spanStart` is only meaningful while inside a quote (inSingle or
// inDouble true) — it holds the index of that quote's first content
// character, set the moment the quote opens.
interface QuoteScanState {
  inSingle: boolean;
  inDouble: boolean;
  spanStart: number;
}

// Inside a single quote: no escaping at all, only the matching `'` closes
// the span. Returns the next index to resume scanning from.
function stepInsideSingleQuote(cmd: string, i: number, state: QuoteScanState, spans: QuoteSpan[]): number {
  if (cmd[i] === "'") {
    spans.push({ start: state.spanStart, end: i });
    state.inSingle = false;
  }
  return i + 1;
}

// Inside a double quote: a backslash escapes the next character (including
// another `"`); an unescaped `"` closes the span.
function stepInsideDoubleQuote(cmd: string, i: number, state: QuoteScanState, spans: QuoteSpan[]): number {
  const ch = cmd[i];
  if (ch === "\\" && i + 1 < cmd.length) return i + 2;
  if (ch === '"') {
    spans.push({ start: state.spanStart, end: i });
    state.inDouble = false;
    return i + 1;
  }
  return i + 1;
}

// Outside any quote: a backslash escapes the next character; an unescaped
// `'`/`"` opens a new span.
function stepOutsideQuote(cmd: string, i: number, state: QuoteScanState): number {
  const ch = cmd[i];
  if (ch === "\\" && i + 1 < cmd.length) return i + 2;
  if (ch === "'") {
    state.inSingle = true;
    state.spanStart = i + 1;
    return i + 1;
  }
  if (ch === '"') {
    state.inDouble = true;
    state.spanStart = i + 1;
    return i + 1;
  }
  return i + 1;
}

function analyzeQuotes(cmd: string): QuoteAnalysis {
  const spans: QuoteSpan[] = [];
  const state: QuoteScanState = { inSingle: false, inDouble: false, spanStart: -1 };
  let i = 0;

  while (i < cmd.length) {
    if (state.inSingle) {
      i = stepInsideSingleQuote(cmd, i, state, spans);
    } else if (state.inDouble) {
      i = stepInsideDoubleQuote(cmd, i, state, spans);
    } else {
      i = stepOutsideQuote(cmd, i, state);
    }
  }

  return { balanced: !state.inSingle && !state.inDouble, spans };
}

// Replaces each span's content with FILLER_CHAR, preserving the command's
// overall length and every character outside the spans (including the quote
// characters themselves) unchanged.
function blankSpans(cmd: string, spans: QuoteSpan[]): string {
  const chars = cmd.split("");
  for (const { start, end } of spans) {
    for (let idx = start; idx < end; idx++) {
      chars[idx] = FILLER_CHAR;
    }
  }
  return chars.join("");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function prepareRoutableCommand(cmd: string): PrepareRoutableCommandResult {
  if (hasCommandExecutingWrapper(cmd)) {
    return { routable: cmd, blanked: false };
  }

  const { balanced, spans } = analyzeQuotes(cmd);
  if (!balanced || spans.length === 0) {
    return { routable: cmd, blanked: false };
  }

  return { routable: blankSpans(cmd, spans), blanked: true };
}

// ---------------------------------------------------------------------------
// Force-push detection — closed positive grammar (Task-9, Invariant G)
//
// Replaces a character-denylist that was defeated three times by three
// different shell token-reconstruction techniques (whole-token quoting,
// mid-token quote-splicing, brace expansion / backtick substitution — see
// 01-root-cause.md § Addendum 2). A denylist enumerates bad characters; this
// enumerates nothing. It permits ONLY the exact benign push shape — every
// character in the safe set, benign flags only, and a destination that is
// both a plain branch name AND not ref-namespace-qualified (see
// isPlainBranchDestination) — and denies every deviation from that one
// shape, so an obfuscation technique this module's author never considered
// still lands on the deny side — because it is not the one permitted shape,
// not because it was specifically detected.
//
// By-construction guarantee (proof in 01-root-cause.md § Addendum 2):
//   (a) forcing a push requires either a force flag (-f/--force/
//       --force-with-lease) or a `+`-prefixed refspec;
//   (b) `+` is outside the safe character set below, so every `+refspec`
//       already fails isLiteralSafeCommand;
//   (c) reconstructing `--force` from parts (quoting, backslash-escape,
//       `$`-expansion/substitution, backtick substitution, brace expansion,
//       globbing, process substitution) requires a metacharacter that is
//       ALSO outside the safe set — so any command that passes the char-gate
//       is literal, and a literal `--force`/`-f` is rejected by the benign
//       flag allowlist;
//   (d) a force flag presented as a dash-prefixed POSITIONAL (`git push
//       origin -f`) contains no character outside the safe set (`-` is
//       required for kebab branch names) — this is CWE-88 argument
//       injection, a distinct closure from (b)/(c): every dash-prefixed
//       token, in any position, is classified as a flag and checked against
//       the same benign allowlist, and isPlainBranchDestination separately
//       refuses any positional that begins with `-`.
//
// Honest scope (G-2): this reasons about what the COMMAND STRING can
// express, not the resolved argv/binary/config/environment. A `git` alias,
// a shadowing binary earlier on PATH, `push.default`/`remote.origin.push`
// git config, or a `GIT_*` environment override are out of scope by design —
// an attacker with any of those already has code execution in the session
// and does not need to smuggle anything through a git command string.
// ---------------------------------------------------------------------------

// The only characters a literal, non-reconstructable command string may
// contain. Every shell token-reconstruction mechanism (quoting, backslash-
// escape, `$`-expansion/substitution/ANSI-C quoting, backtick substitution,
// brace expansion, globbing, process substitution) requires at least one
// character outside this set.
const SAFE_COMMAND_CHAR_RE = /^[A-Za-z0-9 _./-]*$/;

// Total precondition (AC-3a): must be checked, and must pass, before any
// classification branch below runs — a command containing so much as one
// out-of-set character is never given a chance to look like the benign form.
export function isLiteralSafeCommand(cmd: string): boolean {
  return SAFE_COMMAND_CHAR_RE.test(cmd);
}

// Moved verbatim from dev-guard.ts's BENIGN_PUSH_FLAG_RE — the closed
// allowlist of flags that do not disqualify a push from the benign form.
const BENIGN_PUSH_FLAG_RE = /^(-u|--set-upstream|-v|--verbose|--progress)$/;

export function isBenignPushFlag(token: string): boolean {
  return BENIGN_PUSH_FLAG_RE.test(token);
}

// Moved VERBATIM from dev-guard.ts's PLAIN_BRANCH_NAME_RE. The leading
// character class `[A-Za-z0-9._]` excludes `-`, which is the sub-rule that
// closes the CWE-88 dash-prefixed-positional case: a token starting with
// `-` (e.g. `-f`, `--delete`) can never itself pass as this recognizer's
// branch-name positional, regardless of what follows the dash. MUST NOT be
// loosened.
const PLAIN_BRANCH_NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

export function isPlainBranchName(token: string): boolean {
  return PLAIN_BRANCH_NAME_RE.test(token);
}

// Ref-namespace words that disqualify a destination's first `/`-segment,
// checked case-insensitively. Shared by dev-guard.ts's destination-shape
// check and matchBenignPushGrammar below (moved here from a dev-guard.ts-
// local declaration to close a real gap: isPlainBranchName's character class
// alone accepts a slash-joined ref path like `refs/heads/main` as a "plain"
// token, since `/` is a valid interior character for an ordinary branch name
// too — this set is what tells a qualified/abbreviated ref form apart from
// an actual branch name). Closes every qualified (`refs/heads/main`),
// abbreviated (`heads/main`), and case-variant (`REFS/HEADS/main`) form in
// one shot. An ordinary branch whose first segment is a non-reserved word
// (e.g. `feature/my-branch`, `fix/bug-123`) is unaffected.
const REF_NAMESPACE_WORDS = new Set(["refs", "heads", "tags", "remotes"]);

// A destination is a "plain branch name" ONLY when its full shape matches
// isPlainBranchName AND its first `/`-segment is not a ref-namespace word.
export function isPlainBranchDestination(dst: string): boolean {
  if (!isPlainBranchName(dst)) return false;
  const firstSegment = dst.split("/")[0].toLowerCase();
  return !REF_NAMESPACE_WORDS.has(firstSegment);
}

export interface MatchBenignPushGrammarResult {
  matched: boolean;
}

// The one benign closed form: `git push [benign-flags...] origin
// <plain-branch>`, where <plain-branch> is NOT ref-namespace-qualified (see
// isPlainBranchDestination above). The `origin <plain-branch>` positional
// pair is REQUIRED (G-3) — a bare `git push` or `git push origin` (no
// refspec) is the only shape that consults `push.default`/
// `remote.origin.push`, so it is treated as not-benign rather than silently
// deferring to that config. Permits ONLY this one shape and denies every
// deviation — including a benign-looking but ref-namespace-qualified
// destination (`refs/heads/main`, `heads/main`, `remotes/origin/main`,
// `tags/x`), which is excluded by isPlainBranchDestination the same way
// dev-guard.ts's own destination-shape check excludes it, so the two hooks'
// acceptance sets stay aligned on this shared primitive.
export function matchBenignPushGrammar(rawCmd: string): MatchBenignPushGrammarResult {
  if (!isLiteralSafeCommand(rawCmd)) return { matched: false };

  const tokens = rawCmd.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "git" || tokens[1] !== "push") return { matched: false };

  const rest = tokens.slice(2);
  const flagTokens = rest.filter((t) => t.startsWith("-"));
  const positionals = rest.filter((t) => !t.startsWith("-"));

  // Every dash-prefixed token, in ANY position (before or after `origin`),
  // is a flag and must be benign — closes force flags and dash-prefixed
  // positional injection (AC-11) wherever they appear, not just adjacent to
  // `push`.
  if (!flagTokens.every(isBenignPushFlag)) return { matched: false };

  // Exactly one remote positional followed by exactly one branch positional
  // — closes bare/no-refspec pushes (G-3), non-`origin` remotes, and
  // multi-refspec pushes in one shape check.
  if (positionals.length !== 2) return { matched: false };
  if (positionals[0] !== "origin") return { matched: false };
  if (!isPlainBranchDestination(positionals[1])) return { matched: false };

  return { matched: true };
}
