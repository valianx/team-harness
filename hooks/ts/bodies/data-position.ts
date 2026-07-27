// hooks/ts/bodies/data-position.ts
// Shared inert-data-span redactor for command-position gates
// (policy-block.ts, prepublish-guard.ts, dev-guard.ts). Independent module —
// hooks/ts/bodies/command-lexer.ts is fenced surface and is never imported
// from or modified by this file (see HEREDOC_INERT_SINKS below for why its
// membership criterion is copied literally instead of imported).
//
// Problem this closes: a command-position gate that matches its own patterns
// against the FULL raw command string cannot tell a covered action that is
// genuinely about to run from one sitting inertly inside data a non-executing
// consumer will only ever write or display — a heredoc body handed to `cat`,
// a quoted argument handed to `echo`. Both are legitimate audit-log idioms
// (`cat >> log.jsonl << 'EOF' ... EOF`, `echo "..." >> audit.log`) that today
// deny on a false positive: the denied pattern is present in the STRING but
// never reaches a shell that would execute it.
//
// Mechanism: `redactInertDataSpans` is a single-pass, bounded, non-
// backtracking lexical scan (mirrors normalizeLexicalNoise's bounded-scan
// discipline below in policy-block.ts, and command-lexer.ts::scanCommand's
// quote/escape state machine, documented byte-for-byte identical — see
// `readToken` below) that identifies command-string spans that are (a)
// delimited as literal-or-non-expandable data, (b) consumed by a simple
// command whose resolved argv[0] basename belongs to a small, closed list of
// never-executing consumers (`HEREDOC_INERT_SINKS`), with every downstream
// pipe receiver in the same pipeline satisfying the same membership, and (c)
// not routed by that same simple command to an executor (no process-
// substitution span, no redirection target other than a plain,
// non-expandable path) — and replaces those spans' characters with U+0020,
// preserving length and every other byte untouched.
//
// What holds the security of this design, and what does not: the offset-
// preserving substitution can only REMOVE a raw-string match or ADD one that
// straddles a marked span (fail-safe: over-denial, never under-denial for
// policy-block/prepublish-guard) — it never relocates or splices matches
// across non-contiguous fragments. The load-bearing claim is the SOUNDNESS
// OF THE PREDICATE (steps 3-4 below): that HEREDOC_INERT_SINKS membership,
// literal/non-expandable delimitation, and output-destination-is-not-an-
// executor correctly identify spans that truly cannot become a command.
// `dev-guard.ts` does not depend on this module being correct at all — see
// its own integration comment for why.
//
// Fail-closed (step 6): any parsing ambiguity — an unclosed quote, an
// unterminated heredoc, an unresolvable delimiter, an unresolvable argv[0],
// oversized input, or the two-byte sequence `>(`/`<(` occurring ANYWHERE in
// the input (lexical, not positional — closes file-descriptor indirection,
// e.g. `exec 3> >(bash); cat << 'EOF' >&3`, without enumerating every `>&N`
// form) — returns `cmd` unmodified. This is a deliberate, accepted source of
// false positives (a heredoc that merely DOCUMENTS the two-byte sequence
// also loses the carve-out) traded for closing an indirection the positional
// alternative cannot close without an operator enumeration.

// ---------------------------------------------------------------------------
// HEREDOC_INERT_SINKS — literal copy of command-lexer.ts's
// SAFE_NON_EXECUTING_BASENAMES (fenced; not imported, not modified). A
// basename qualifies only when BOTH of the following hold:
//
//   1. (reproduced verbatim from the origin's own membership criterion) per
//      its authoritative documentation, it has no mechanism to (a) execute a
//      command or spawn an operator-chosen subprocess from any of its own
//      argv arguments, (b) execute/evaluate stdin (or any input byte-stream)
//      as a command or script, or (c) invoke an operator-named external
//      program via any flag, builtin, environment variable, or
//      interactive/input-triggered mechanism. Ante la duda, se excluye — a
//      wrong exclusion only costs a fail-safe over-ask, never a bypass.
//   2. (this module's own requirement — the origin does not certify this)
//      the span this command CONSUMES cannot be routed to an executor by
//      THIS SAME simple command. Condition (c) of the sink predicate below
//      is what this second condition demands: a basename can satisfy
//      condition 1 and still let its consumed data reach an executor via
//      process substitution or an fd-indirected redirect target
//      (`tee >(bash) << 'EOF'`, `cat << 'EOF' > >(bash)`).
//
// A subset assertion in tests/test_policy_block.sh ties this list to
// SAFE_NON_EXECUTING_BASENAMES and fails on drift below the recorded
// cardinality (never silently narrows the wrong direction).
// ---------------------------------------------------------------------------
export const HEREDOC_INERT_SINKS = new Set([
  "grep", "egrep", "fgrep", "echo", "printf", "cat", "ls", "ln", "test", "[",
  "tee", "head", "tail", "wc", "uniq", "cut", "tr",
  "nl", "rev", "tac", "paste", "join", "column", "fold", "fmt", "pr",
  "diff", "cmp", "comm", "md5sum", "sha1sum", "sha256sum", "sha512sum",
  "base64", "xxd", "od", "hexdump", "strings", "file",
  "pwd", "true", "false",
]);

// A command string longer than this is rejected before scanning — bounded
// input size, same discipline as the linear-scan functions this module
// mirrors (no backtracking regex is used anywhere in this file, so there is
// no ReDoS surface; the cap exists purely to bound total scan cost).
const MAX_INPUT_LENGTH = 65536;

// ---------------------------------------------------------------------------
// Lexical tokens — quote/escape state machine, documented as behaviorally
// identical to command-lexer.ts::scanCommand (verified by a differential
// assertion in tests/test_policy_block.sh, bounded to the domain where the
// two outputs are comparable — see `probeArgv0SequenceForDiff` below):
//   - single quote: nothing escapes.
//   - double quote: `\` escapes only `"`, `\`, `$`, and backtick; any other
//     character after `\` keeps the backslash literally.
//   - unquoted: `\` escapes the following character; `$(`/backtick open an
//     opaque, never-evaluated command-substitution span; `{ } * ? [ ~` are
//     glob/brace/tilde metacharacters that never expand inside quotes.
// ---------------------------------------------------------------------------

type SegmentOperator = "start" | ";" | "&&" | "||" | "&" | "|" | "\n";
type InCommandOperator = "<<" | "<<-" | "<<<" | ">>" | "&>" | ">";

interface OperatorMatch {
  kind: "segment" | "in-command";
  op: SegmentOperator | InCommandOperator;
  length: number;
}

// Longest-match-first: `<<<`/`<<-` before `<<`, `&&`/`&>` before bare `&`,
// `>>` before bare `>`. A bare `<` is deliberately unrecognized (falls
// through to a literal token character) — this module only needs to detect
// `<<`/`<<-` (heredoc) and `<<<` (here-string, explicitly excluded from
// heredoc handling); a plain input redirect carries no output-executor risk
// (condition (c) only concerns the OUTPUT destination). A bare `(`/`)` is a
// segment boundary (subshell), mirroring command-lexer.ts's PAREN_BOUNDARY_CHARS
// — never recursed into, out of scope for both modules alike.
function matchOperator(cmd: string, i: number): OperatorMatch | null {
  if (cmd.startsWith("<<<", i)) return { kind: "in-command", op: "<<<", length: 3 };
  if (cmd.startsWith("<<-", i)) return { kind: "in-command", op: "<<-", length: 3 };
  if (cmd.startsWith("<<", i)) return { kind: "in-command", op: "<<", length: 2 };
  if (cmd.startsWith("&&", i)) return { kind: "segment", op: "&&", length: 2 };
  if (cmd.startsWith("||", i)) return { kind: "segment", op: "||", length: 2 };
  if (cmd.startsWith(">>", i)) return { kind: "in-command", op: ">>", length: 2 };
  if (cmd.startsWith("&>", i)) return { kind: "in-command", op: "&>", length: 2 };

  const ch = cmd[i];
  if (ch === ";" || ch === "\n" || ch === "&" || ch === "|") {
    return { kind: "segment", op: ch, length: 1 };
  }
  if (ch === "(" || ch === ")") return { kind: "segment", op: "start", length: 1 };
  if (ch === ">") return { kind: "in-command", op: ">", length: 1 };
  return null;
}

interface QuoteSpan {
  start: number;
  end: number; // exclusive, includes both delimiter characters
  kind: "single" | "double";
  /** Double-quote spans only: true when a genuine unresolved `$` or
   *  backtick survives inside (i.e., NOT one consumed by a `\"`/`\\`/`\$`/
   *  `` \` `` escape) — such a span is expandable and never redacted
   *  (AC-1.18). Always false for single-quote spans (nothing expands). */
  hasUnescapedExpansion: boolean;
}

interface TokenReadResult {
  value: string;
  tainted: boolean;
  start: number;
  end: number; // exclusive
  quoteSpans: QuoteSpan[];
  unclosedQuote: boolean;
  /** True when this token's construction ever entered a quote or consumed a
   *  backslash-escape — the heredoc-delimiter "quotedness" test (any
   *  quoting anywhere in the word disables body expansion, matching bash). */
  wasQuotedOrEscaped: boolean;
}

// Consumes an opaque `$(...)` span (never evaluated, only bounded so its
// content cannot manufacture a false token boundary) and returns the offset
// immediately after it. Mirrors command-lexer.ts::consumeParenSubstitution's
// bounded quote/paren-depth tracking exactly, without building a value (the
// caller slices the raw text directly).
function consumeParenSpan(cmd: string, startI: number): number {
  let i = startI + 2;
  let depth = 1;
  let sq = false;
  let dq = false;
  while (i < cmd.length && depth > 0) {
    const ch = cmd[i];
    if (sq) {
      if (ch === "'") sq = false;
      i++;
      continue;
    }
    if (dq) {
      if (ch === "\\" && i + 1 < cmd.length) {
        i += 2;
        continue;
      }
      if (ch === '"') dq = false;
      i++;
      continue;
    }
    if (ch === "'") sq = true;
    else if (ch === '"') dq = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    i++;
  }
  return i;
}

// Consumes an opaque backtick span the same way as consumeParenSpan above.
function consumeBacktickSpan(cmd: string, startI: number): number {
  let i = startI + 1;
  while (i < cmd.length && cmd[i] !== "`") {
    if (cmd[i] === "\\" && i + 1 < cmd.length) {
      i += 2;
      continue;
    }
    i++;
  }
  if (i < cmd.length) i++;
  return i;
}

const UNQUOTED_TAINT_CHARS = new Set(["{", "}", "*", "?", "[", "~"]);

interface QuotedSpanResult {
  value: string;
  end: number;
  unclosedQuote: boolean;
  tainted: boolean;
}

// Reads a single-quoted span starting at the opening `'` (index `i`):
// nothing escapes inside single quotes, matching command-lexer.ts's own
// single-quote handling — always untainted.
function readSingleQuotedSpan(cmd: string, i: number): QuotedSpanResult {
  let value = "";
  let pos = i + 1;
  while (pos < cmd.length && cmd[pos] !== "'") {
    value += cmd[pos];
    pos++;
  }
  if (pos >= cmd.length) return { value, end: pos, unclosedQuote: true, tainted: false };
  return { value, end: pos + 1, unclosedQuote: false, tainted: false };
}

// Reads a double-quoted span starting at the opening `"` (index `i`): `\`
// escapes only `"`, `\`, `$`, and backtick; an unescaped `$(`, backtick, or
// bare `$` marks the span tainted (expandable) without altering the
// accumulated literal value's byte content.
function readDoubleQuotedSpan(cmd: string, i: number): QuotedSpanResult {
  let value = "";
  let pos = i + 1;
  let tainted = false;
  while (pos < cmd.length && cmd[pos] !== '"') {
    const c = cmd[pos];
    if (c === "\\" && pos + 1 < cmd.length) {
      const nc = cmd[pos + 1];
      value += nc === '"' || nc === "\\" || nc === "$" || nc === "`" ? nc : "\\" + nc;
      pos += 2;
      continue;
    }
    if (c === "$" && cmd[pos + 1] === "(") {
      tainted = true;
      const consumed = consumeParenSpan(cmd, pos);
      value += cmd.slice(pos, consumed);
      pos = consumed;
      continue;
    }
    if (c === "`") {
      tainted = true;
      const consumed = consumeBacktickSpan(cmd, pos);
      value += cmd.slice(pos, consumed);
      pos = consumed;
      continue;
    }
    if (c === "$") {
      tainted = true;
      value += c;
      pos++;
      continue;
    }
    value += c;
    pos++;
  }
  if (pos >= cmd.length) return { value, end: pos, unclosedQuote: true, tainted };
  return { value, end: pos + 1, unclosedQuote: false, tainted };
}

interface UnquotedSegmentResult {
  value: string;
  end: number;
  tainted: boolean;
  wasEscape: boolean;
}

// Consumes exactly one unquoted segment starting at index `i` — a
// backslash-escape pair, an opaque `$(...)`/backtick span, a bare `$`, one
// of UNQUOTED_TAINT_CHARS, or a single plain character. Only the
// backslash-escape case reports `wasEscape` (the heredoc-delimiter
// "quotedness" test bash applies); none of the other branches taint the
// caller's own quoted-vs-escaped tracking.
function consumeUnquotedSegment(cmd: string, i: number): UnquotedSegmentResult {
  const ch = cmd[i];

  if (ch === "\\" && i + 1 < cmd.length) {
    return { value: cmd[i + 1], end: i + 2, tainted: false, wasEscape: true };
  }
  if (ch === "$" && cmd[i + 1] === "(") {
    const consumed = consumeParenSpan(cmd, i);
    return { value: cmd.slice(i, consumed), end: consumed, tainted: true, wasEscape: false };
  }
  if (ch === "`") {
    const consumed = consumeBacktickSpan(cmd, i);
    return { value: cmd.slice(i, consumed), end: consumed, tainted: true, wasEscape: false };
  }
  if (ch === "$" || UNQUOTED_TAINT_CHARS.has(ch)) {
    return { value: ch, end: i + 1, tainted: true, wasEscape: false };
  }
  return { value: ch, end: i + 1, tainted: false, wasEscape: false };
}

// Reads exactly one token starting at `start`: whitespace and quote/escape
// handling identical to command-lexer.ts's per-character state machine,
// extended to stop at this module's own operator set (see matchOperator)
// instead of command-lexer.ts's narrower one. Self-contained — manages any
// quote spans WITHIN the token itself, so the caller never needs external
// quote-state tracking across tokens. Delegates each quoting mode to its
// own helper (readSingleQuotedSpan/readDoubleQuotedSpan/
// consumeUnquotedSegment) so this dispatch loop stays a flat state machine
// regardless of how much a single quoting mode's own parsing grows.
function readToken(cmd: string, start: number): TokenReadResult {
  let i = start;
  let value = "";
  let tainted = false;
  let wasQuotedOrEscaped = false;
  let unclosedQuote = false;
  const quoteSpans: QuoteSpan[] = [];

  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === " " || ch === "\t" || ch === "\r") break;
    if (matchOperator(cmd, i)) break;

    if (ch === "'" || ch === '"') {
      wasQuotedOrEscaped = true;
      const spanStart = i;
      const span = ch === "'" ? readSingleQuotedSpan(cmd, i) : readDoubleQuotedSpan(cmd, i);
      if (span.unclosedQuote) {
        unclosedQuote = true;
        break;
      }
      value += span.value;
      i = span.end;
      if (span.tainted) tainted = true;
      const kind: "single" | "double" = ch === "'" ? "single" : "double";
      quoteSpans.push({ start: spanStart, end: i, kind, hasUnescapedExpansion: span.tainted });
      continue;
    }

    const seg = consumeUnquotedSegment(cmd, i);
    if (seg.wasEscape) wasQuotedOrEscaped = true;
    if (seg.tainted) tainted = true;
    value += seg.value;
    i = seg.end;
  }

  return { value, tainted, start, end: i, quoteSpans, unclosedQuote, wasQuotedOrEscaped };
}

// ---------------------------------------------------------------------------
// Simple-command / heredoc structure — the parse this module builds once,
// consumed by both the redaction pass and the sink-membership predicate.
// ---------------------------------------------------------------------------

interface Argv0Info {
  start: number;
  end: number;
  value: string;
  tainted: boolean;
}

interface CommandRecord {
  argv0: Argv0Info | null;
  heredocIds: number[];
  /** Predicate condition (c): false when this command's own redirection
   *  routes to something other than a plain, untainted path (an fd-dup
   *  target like `>&3`, a tainted/expandable target, or a missing target). */
  redirectTargetsOk: boolean;
  precedingOperator: SegmentOperator;
}

interface HeredocRecord {
  attributedCmdIndex: number;
  quotedDelimiter: boolean;
  delimiter: string;
  stripLeadingTabs: boolean;
  bodyStart: number;
  bodyEnd: number; // exclusive of the terminator line
  afterTerminator: number;
  bodyHasDollarOrBacktick: boolean;
}

interface TaggedQuoteSpan extends QuoteSpan {
  cmdIndex: number;
  isArgv0: boolean;
}

interface ScanResult {
  commands: CommandRecord[];
  heredocs: HeredocRecord[];
  quoteSpans: TaggedQuoteSpan[];
  /** Offset of the first top-level `<<`/`<<-` introducer, or null when the
   *  input has no heredoc at all — the boundary of the domain where this
   *  module's parse is comparable to command-lexer.ts::analyzeCommand's
   *  (see probeArgv0SequenceForDiff). */
  firstHeredocIntroducerStart: number | null;
}

// Scans a heredoc body starting at `from` for the line that exactly equals
// `delimiter` (after stripping ONLY leading tab characters when
// `stripLeadingTabs`, i.e. `<<-` — never spaces, and never more than bash's
// own tab-only rule). Returns null when no such line exists before EOF
// (unterminated heredoc — a global fail-closed trigger).
function findHeredocTerminator(
  cmd: string,
  from: number,
  delimiter: string,
  stripLeadingTabs: boolean
): { lineStart: number; afterLine: number } | null {
  let pos = from;
  while (pos <= cmd.length) {
    const nlIdx = cmd.indexOf("\n", pos);
    const lineEnd = nlIdx === -1 ? cmd.length : nlIdx;
    const line = cmd.slice(pos, lineEnd);
    const content = stripLeadingTabs ? line.replace(/^\t+/, "") : line;
    if (content === delimiter) {
      return { lineStart: pos, afterLine: nlIdx === -1 ? cmd.length : nlIdx + 1 };
    }
    if (nlIdx === -1) return null;
    pos = nlIdx + 1;
  }
  return null;
}

// Consumes every heredoc body queued for one physical line, in declaration
// order (AC-1.25, AC-1.29) — bodies are consecutive, each starting right
// where the previous one's terminator line ended. Returns the new scan
// cursor (past every consumed terminator line), or null when any heredoc in
// the queue is unterminated.
function consumeHeredocQueue(
  cmd: string,
  startPos: number,
  queueIds: number[],
  heredocs: HeredocRecord[]
): number | null {
  let cursor = startPos;
  for (const id of queueIds) {
    const rec = heredocs[id];
    const bodyStart = cursor;
    const terminator = findHeredocTerminator(cmd, bodyStart, rec.delimiter, rec.stripLeadingTabs);
    if (terminator === null) return null;
    rec.bodyStart = bodyStart;
    rec.bodyEnd = terminator.lineStart;
    rec.afterTerminator = terminator.afterLine;
    // A body's content is NEVER re-scanned for further introducers or
    // simple-command boundaries (AC-1.30) — a plain substring test for `$`
    // or backtick is all condition 4(a) requires for an unquoted delimiter.
    rec.bodyHasDollarOrBacktick = /[$`]/.test(cmd.slice(bodyStart, terminator.lineStart));
    cursor = terminator.afterLine;
  }
  return cursor;
}

// Single linear pass building the simple-command / heredoc / quote-span
// structure. Returns null on any fail-closed condition (unclosed quote,
// unterminated heredoc, unresolvable/tainted heredoc delimiter).
function scanForDataPositions(cmd: string): ScanResult | null {
  const commands: CommandRecord[] = [];
  const heredocs: HeredocRecord[] = [];
  const quoteSpans: TaggedQuoteSpan[] = [];
  let pendingHeredocQueue: number[] = [];
  let firstHeredocIntroducerStart: number | null = null;

  let curArgv0: Argv0Info | null = null;
  let curTokenCount = 0;
  let curHeredocIds: number[] = [];
  let curRedirectOk = true;
  let curPrecedingOp: SegmentOperator = "start";

  const finalizeCommand = (): void => {
    commands.push({
      argv0: curArgv0,
      heredocIds: curHeredocIds,
      redirectTargetsOk: curRedirectOk,
      precedingOperator: curPrecedingOp,
    });
    curArgv0 = null;
    curTokenCount = 0;
    curHeredocIds = [];
    curRedirectOk = true;
  };

  let i = 0;
  while (i < cmd.length) {
    const ch = cmd[i];

    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    const op = matchOperator(cmd, i);
    if (op) {
      if (op.kind === "segment") {
        if (op.op === "\n") {
          finalizeCommand();
          i += op.length;
          const consumed = consumeHeredocQueue(cmd, i, pendingHeredocQueue, heredocs);
          if (consumed === null) return null;
          i = consumed;
          pendingHeredocQueue = [];
          curPrecedingOp = "\n";
          continue;
        }
        finalizeCommand();
        i += op.length;
        curPrecedingOp = op.op as SegmentOperator;
        continue;
      }

      if (op.op === "<<" || op.op === "<<-") {
        if (firstHeredocIntroducerStart === null) firstHeredocIntroducerStart = i;
        i += op.length;
        while (i < cmd.length && (cmd[i] === " " || cmd[i] === "\t")) i++;
        const delim = readToken(cmd, i);
        if (delim.unclosedQuote) return null;
        if (delim.end === delim.start) return null; // unresolvable delimiter
        if (delim.tainted) return null; // unresolvable delimiter
        i = delim.end;
        const hId = heredocs.length;
        heredocs.push({
          attributedCmdIndex: commands.length,
          quotedDelimiter: delim.wasQuotedOrEscaped,
          delimiter: delim.value,
          stripLeadingTabs: op.op === "<<-",
          bodyStart: -1,
          bodyEnd: -1,
          afterTerminator: -1,
          bodyHasDollarOrBacktick: false,
        });
        curHeredocIds.push(hId);
        pendingHeredocQueue.push(hId);
        continue;
      }

      if (op.op === "<<<") {
        // Here-string — explicitly not a heredoc: consumed as a boundary
        // only, its following word is ordinary command text with no
        // special tracking.
        i += op.length;
        continue;
      }

      // ">>" | "&>" | ">" — redirection; validate condition (c).
      i += op.length;
      while (i < cmd.length && (cmd[i] === " " || cmd[i] === "\t")) i++;
      const target = readToken(cmd, i);
      if (target.unclosedQuote) return null;
      i = target.end;
      const targetValid = target.end > target.start && !target.tainted;
      if (!targetValid) curRedirectOk = false;
      continue;
    }

    const tok = readToken(cmd, i);
    if (tok.unclosedQuote) return null;
    if (tok.end === tok.start) {
      // No operator matched and no character was consumed — cannot happen
      // for any printable byte reaching this branch, but guards against an
      // infinite loop rather than assuming it is unreachable.
      i++;
      continue;
    }
    const isArgv0 = curTokenCount === 0;
    if (isArgv0) {
      curArgv0 = { start: tok.start, end: tok.end, value: tok.value, tainted: tok.tainted };
    }
    for (const qs of tok.quoteSpans) {
      quoteSpans.push({ ...qs, cmdIndex: commands.length, isArgv0 });
    }
    curTokenCount++;
    i = tok.end;
  }

  finalizeCommand();
  if (pendingHeredocQueue.length > 0) {
    const consumed = consumeHeredocQueue(cmd, i, pendingHeredocQueue, heredocs);
    if (consumed === null) return null;
  }

  return { commands, heredocs, quoteSpans, firstHeredocIntroducerStart };
}

// ---------------------------------------------------------------------------
// Sink-membership predicate (steps 3-4 of the algorithm) — a pipeline group
// (consecutive simple commands joined by unquoted `|`) is fully inert only
// when EVERY member's resolved argv[0] basename is in HEREDOC_INERT_SINKS
// AND every member's own redirection targets pass condition (c). A group of
// size one (no pipe at all) reduces to checking its lone member.
// ---------------------------------------------------------------------------

// Path-segment and `.exe`-suffix resolution mirror command-lexer.ts's own
// `canonicalBasename` (path segment last, `.exe` stripped case-insensitively
// via the same `/\.exe$/i` rule), but deliberately WITHOUT its final
// `.toLowerCase()`. HEREDOC_INERT_SINKS membership is the load-bearing
// SOUNDNESS-OF-THE-PREDICATE claim this module's header names (an
// under-inclusive match only costs a fail-safe over-ask; an over-inclusive
// one masks a real command from the deny scan) — so it requires an
// EXACT-case match against the set's own all-lowercase spellings, the same
// exact-case discipline `command-lexer.ts`'s `binaryCaseExact` field applies
// before an `allow`-capable branch in `dev-guard.ts` may trust a resolved
// basename (`command-lexer.ts:850-1084`, gated at `dev-guard.ts:354,477`). A
// capitalized spelling (`Cat`, `Tee`, `Echo`) is a DIFFERENT executable on a
// case-sensitive filesystem and must not fold into the sink set.
function sinkCandidateBasename(value: string): string {
  const idx = value.lastIndexOf("/");
  const base = idx >= 0 ? value.slice(idx + 1) : value;
  return /\.exe$/i.test(base) ? base.slice(0, -4) : base;
}

function computeSinkFlags(commands: CommandRecord[]): boolean[] {
  const isSink = new Array<boolean>(commands.length).fill(false);
  let groupStart = 0;

  for (let idx = 0; idx <= commands.length; idx++) {
    const startsNewGroup = idx === commands.length || commands[idx].precedingOperator !== "|";
    if (!startsNewGroup) continue;

    if (idx > groupStart) {
      const group = commands.slice(groupStart, idx);
      const groupInert = group.every((c) => {
        if (c.argv0 === null) return false;
        return HEREDOC_INERT_SINKS.has(sinkCandidateBasename(c.argv0.value)) && c.redirectTargetsOk;
      });
      for (let k = groupStart; k < idx; k++) isSink[k] = groupInert;
    }
    groupStart = idx;
  }

  return isSink;
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Replaces every command-string span that is (1) inert data — delimited as
 * literal or as non-expandable, (2) consumed by a never-executing sink
 * (transitively, through every pipe receiver), and (3) not routed by that
 * sink to an executor — with same-length U+0020 runs, leaving every other
 * byte untouched. Returns `cmd` unmodified on any parsing ambiguity or on
 * the two-byte sequence `>(`/`<(` appearing anywhere in the input.
 *
 * Frozen contract: this signature is depended on, unmodified, by
 * policy-block.ts, prepublish-guard.ts, and dev-guard.ts.
 */
export function redactInertDataSpans(cmd: string): string {
  if (cmd.length > MAX_INPUT_LENGTH) return cmd;
  if (cmd.includes(">(") || cmd.includes("<(")) return cmd;

  const scan = scanForDataPositions(cmd);
  if (scan === null) return cmd;

  // Global fail-closed: an unresolvable argv[0] anywhere makes basename
  // resolution untrustworthy for the WHOLE input, not just that one
  // command — see the module header's "what holds the security" note.
  if (scan.commands.some((c) => c.argv0 !== null && c.argv0.tainted)) return cmd;

  const isSink = computeSinkFlags(scan.commands);
  const mask = new Uint8Array(cmd.length);

  for (const qs of scan.quoteSpans) {
    if (qs.isArgv0) continue;
    if (!isSink[qs.cmdIndex]) continue;
    if (qs.kind === "double" && qs.hasUnescapedExpansion) continue;
    for (let p = qs.start; p < qs.end; p++) mask[p] = 1;
  }

  for (const h of scan.heredocs) {
    if (!isSink[h.attributedCmdIndex]) continue;
    if (!h.quotedDelimiter && h.bodyHasDollarOrBacktick) continue;
    for (let p = h.bodyStart; p < h.bodyEnd; p++) mask[p] = 1;
  }

  let out = "";
  for (let p = 0; p < cmd.length; p++) out += mask[p] ? " " : cmd[p];
  return out;
}

// ---------------------------------------------------------------------------
// Test-only diagnostic export (AC-1.27) — not part of the frozen contract
// above, not consumed by any of the three gate bodies. Exposes this
// module's own argv[0] resolution restricted to the domain where its output
// is comparable to command-lexer.ts::analyzeCommand's: the input has no
// heredoc introducer at all, or (when it does) only the region strictly
// before the FIRST one — past that point the two parsers diverge by
// construction (`"\n"` is a segment operator in command-lexer.ts, so a
// heredoc body's lines each become a spurious `analyzeCommand` segment; this
// module never re-scans a heredoc body at all).
//
// A second, independent divergence a caller must also exclude from any
// comparison: command-lexer.ts recursively unwraps a recognized wrapper's
// statically-resolvable payload and merges the unwrapped commands into its
// result (`bash -c "git push origin main"` resolves to TWO EffectiveCommands
// — "bash" and "git" — not one), which this module never attempts. This
// module only needs to know what DATA a sink consumes; it has no reason to
// resolve what a wrapper's payload recursively evaluates to, so an input
// whose comparable prefix's leading simple command is a wrapper form
// (`bash`/`sh`/`eval`/`xargs`/`env -S` and similar) is not comparable here
// either, for the same "different job, not a bug" reason as heredoc bodies.
// ---------------------------------------------------------------------------
export function probeArgv0SequenceForDiff(
  cmd: string
): { comparablePrefix: string; argv0s: Array<string | null> } | null {
  const scan = scanForDataPositions(cmd);
  if (scan === null) return null;

  const cutPos = scan.firstHeredocIntroducerStart ?? cmd.length;
  const comparablePrefix = cmd.slice(0, cutPos);
  const prefixScan = scanForDataPositions(comparablePrefix);
  if (prefixScan === null) return null;

  const argv0s = prefixScan.commands
    .filter((c) => c.argv0 !== null)
    .map((c) => (c.argv0 as Argv0Info).value);
  return { comparablePrefix, argv0s };
}
