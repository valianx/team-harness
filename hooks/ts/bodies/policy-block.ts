// hooks/ts/bodies/policy-block.ts
// Canonical body — verbatim port of hooks/policy-block.sh decision logic.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput;
// returns only NormalizedDecision. Never branches on `input.runtime`.
//
// FOLD: the Python-path entropy scan (shannon_entropy + MEDIUM_CONFIDENCE_PATTERN)
// is folded inline into TS here — zero npm dependency.
// This is the SINGLE authoritative path (no python3-preferred / bash-degraded split).
//
// Fail mode: degraded-but-enforcing — non-matching tool calls → none (no-decision).
// Enforcement class: security gate. NEVER imports hook-profile helper.
//
// AC-9: Shannon entropy formula verbatim; threshold >= 3.5; boundary fixtures tested.
// AC-15: reason names the pattern CLASS, never the captured value (CWE-200).
//
// Task-6 (AC-6.2/AC-6.4/AC-6.5, SEC-DR-B): a `claude ... --dangerously-skip-
// permissions` spawn bypasses every downstream hook at whatever depth it
// runs — the process it launches never re-enters this gate.
//
// HONEST FRAMING (SEC-001 remediation, Round 1-2 — see docs/dev-mode.md
// § Outward-Action Gate): this deny is a BEST-EFFORT text-heuristic
// backstop for the LEGACY Bash-spawn path only, NOT a security boundary. A
// PreToolUse hook that only sees a raw Bash command STRING cannot robustly
// deny by parsing it — a determined caller evades a command-string matcher
// via runtime shell evaluation the matcher structurally cannot see: variable
// indirection (`X=--flag; claude $X`), command substitution (`$(...)`,
// backticks), and equivalent wrapper scripts. The value bash actually
// executes is only known at shell-expansion time, after this hook has
// already made its decision — that gap is not closable by any command-string
// regex, normalization included, and is a documented residual, not a bug in
// this heuristic.
//
// What normalization DOES close (Round 2): every SINGLE-PASS lexical-noise
// evasion — inserting empty quote pairs or an escaping backslash anywhere
// inside a literal token to defeat a naive substring/regex match, without
// changing what the token evaluates to at shell-expansion time (`cla""ude`,
// `"claude"`, `c'l'aude`, `\claude`, `cl\aude` all evaluate to the plain
// string `claude`). `normalizeLexicalNoise()` performs this class of
// bash quote/escape removal ONCE, ahead of matching, instead of chasing each
// instance with its own regex — see that function for the bounded linear-scan
// implementation (no full shell parser, no ReDoS exposure).
//
// The HARD guarantee that a lane never spawns a skip-permissions child is
// AC-6.4 (native Task-tool spawn in the split path): once the split's
// capability floor is met, orchestrators spawn via the Task tool — no Bash
// `claude` invocation exists on that path at all, so there is nothing for
// any evasion to hide inside. AC-6.4 is the structural control; this file's
// deny is defense-in-depth for the path that structural control does not
// yet cover. The single carve-out below exists for the legacy/tmux path
// only (agents/orchestrator.md, the top-level batch-spawn confirmed to
// invoke `claude --dangerously-skip-permissions` via Bash) and is an EXACT,
// anti-forgeable match of that command's full literal form (AC-6.5) — not a
// prefix, not a substring, and never conditioned on anything the forger
// could also supply. The exemption match runs against the RAW (non-
// normalized) command string deliberately: normalization is lossy by design
// (it deletes quote/escape characters), and the exemption's anti-forgery
// guarantee depends on matching the literal template byte-for-byte,
// including the quoting inside its embedded --settings JSON blob.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

function deny(reason: string): NormalizedDecision {
  return {
    decision: "deny",
    reason: `Blocked by team-harness policy: ${reason}. If you genuinely need this, run it manually outside Claude or scope an exception in hooks/ts/bodies/policy-block.ts.`,
    mutations: null,
  };
}

function ask(reason: string): NormalizedDecision {
  return {
    decision: "ask",
    reason: `team-harness policy: possible secret detected (${reason}). Confirm this value is safe to commit, or cancel and remove it.`,
    mutations: null,
  };
}

function askReason(reason: string): NormalizedDecision {
  return {
    decision: "ask",
    reason: `team-harness policy: ${reason}`,
    mutations: null,
  };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// ---------------------------------------------------------------------------
// SKIP-PERMISSIONS SPAWN — best-effort text-heuristic deny (AC-6.2/SEC-DR-B),
// with a single anti-forgeable exact-match carve-out (AC-6.5) for the legacy
// top-level tmux batch-spawn template. See module-header comment for the
// honest-framing rationale (AC-6.4 native Task-tool spawn is the structural
// control; this heuristic is defense-in-depth for the legacy Bash-spawn path
// only, and does not reach runtime shell evaluation).
// ---------------------------------------------------------------------------

// Escapes every regex metacharacter in a literal string so it can be spliced
// into a larger pattern without being interpreted. Declared first — used by
// buildClaudeSkipPermissionsRouterRegex below and by
// buildLegacyTmuxSpawnExemptionRegex further down this file.
function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// LEXICAL NORMALIZATION (SEC-001 remediation, Round 2) — replaces the
// per-pattern quote-tolerant/path-qualifier patchwork with a single bounded
// pre-pass. Bash's own quote-removal and backslash-escape-removal steps turn
// `cla""ude`, `"claude"`, `c'l'aude`, `\claude`, and `cl\aude` into the exact
// same token — `claude` — at shell-expansion time, entirely independent of
// where in the token the quote/backslash noise is planted. A literal-text or
// per-instance regex matcher chases each new placement of that noise
// forever; this function performs the SAME bash normalization ONCE, ahead of
// matching, closing the whole class in one pass instead of the next
// instance of it.
//
// What this strips (bounded, linear scan, O(n), no backtracking → no ReDoS):
//   - `'` / `"` quote delimiters — removed wherever encountered (both empty
//     pairs like `""` and pairs wrapping real characters); inside a single
//     quote, no other character is touched (matches bash: single quotes
//     suppress ALL escaping).
//   - a `\` immediately followed by another character, outside single
//     quotes — the backslash is dropped and the following character is kept
//     literally (matches bash's escape-removal for the common case; a minor
//     over-normalization versus bash's double-quote-specific escape rules,
//     which only WIDENS what gets flagged, never narrows it).
//
// Deliberately NOT attempted (out of scope by design — see module-header
// honest-framing note): variable indirection (`$X`), command substitution
// (`$(...)`, backticks), and wrapper scripts. Those require evaluating the
// shell at runtime, which a static PreToolUse matcher over the raw command
// string structurally cannot do.
function normalizeLexicalNoise(cmd: string): string {
  let out = "";
  let inSingleQuote = false;
  let i = 0;

  while (i < cmd.length) {
    const ch = cmd[i];

    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false;
      } else {
        out += ch;
      }
      i++;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      i++;
      continue;
    }

    if (ch === '"') {
      i++;
      continue;
    }

    if (ch === "\\" && i + 1 < cmd.length) {
      out += cmd[i + 1];
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

// Broad router: ANY invocation of the `claude` binary carrying
// --dangerously-skip-permissions anywhere in the same command counts as
// covered, however dressed up (extra/reordered flags, multi-line
// continuation via `\`, an embedded --settings JSON blob). This is
// deliberately NOT the decision itself — the sole carve-out is
// LEGACY_TMUX_SPAWN_EXEMPTION_RE below. `[\s\S]*?` (not `.*?`) so the match
// spans real newlines in a multi-line Bash tool command. This regex is
// always evaluated against `normalizeLexicalNoise(cmd)`, never against the
// raw command — that is where the quote/backslash-noise class gets closed
// (see normalizeLexicalNoise above), so the flag/basename literals below are
// plain escaped text, not their own quote-tolerant variants.
//
// SEC-001 hardening (Round 1, retained): basename-tolerant `claude` match —
// the leading-boundary alternation only requires the character immediately
// before `claude` to be a shell separator or start-of-string; a path
// separator (`/`, as in `/usr/bin/claude` or `./claude`) is neither, so the
// optional non-capturing group below absorbs any path-qualifier prefix
// (`usr/bin/`, `./`, `bin/`, …) so the match still anchors on `claude` as the
// invoked basename.
function buildClaudeSkipPermissionsRouterRegex(): RegExp {
  // `$` stays excluded from the path-qualifier segment (unlike quotes, its
  // exclusion is not superseded by normalizeLexicalNoise — command
  // substitution markers are left untouched by design, see module header).
  const pathQualifierPrefix = String.raw`(?:[^\s|;&<>()\x60$]*/)?`;
  const flagLiteral = escapeRegExpLiteral("--dangerously-skip-permissions");
  return new RegExp(
    String.raw`(^|[\s|;&<>()\x60])${pathQualifierPrefix}claude\b[\s\S]*?${flagLiteral}\b`,
    "i"
  );
}

const CLAUDE_SKIP_PERMISSIONS_RE = buildClaudeSkipPermissionsRouterRegex();

// Replaces every occurrence of `token` in `escapedText` (already
// regex-escaped) with `firstGroup` on the FIRST occurrence and `laterGroup`
// on every subsequent one — used to turn a repeated doc placeholder into one
// capturing group plus backreferences, so the exemption requires the SAME
// value at every occurrence (anti-forgeable: a forged variant with
// inconsistent values across occurrences fails the match).
function groupRepeatedPlaceholder(
  escapedText: string,
  token: string,
  firstGroup: string,
  laterGroup: string
): string {
  const parts = escapedText.split(token);
  if (parts.length === 1) return escapedText;
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result += (i === 1 ? firstGroup : laterGroup) + parts[i];
  }
  return result;
}

// Verbatim raw text of the legacy top-level batch-spawn command
// (agents/orchestrator.md:4040-4047 at the time of Task-6), byte-identical
// to the fenced bash block in that file (verified via a scripted roundtrip
// during implementation — see 02-implementation.md). `{task-name}` and
// `{number}` are the doc's own placeholder tokens.
const LEGACY_TMUX_SPAWN_RAW =
  "claude --worktree {task-name} --tmux --dangerously-skip-permissions \\\n  --settings '{\n    \"hooks\": {\n      \"Stop\": [{\"hooks\": [{\"type\": \"command\", \"command\": \"STATE=$(cat workspaces/*/00-state.md 2>/dev/null); STATUS=$(echo \\\"$STATE\\\" | grep -oP \\\"status: \\\\K\\\\w+\\\" | head -1); SUMMARY=$(echo \\\"$STATE\\\" | grep -A1 \\\"^## Agent Results\\\" | tail -1 | head -c 200); printf \\\"%s|%s|%s\\\\n\\\" \\\"{task-name}\\\" \\\"${STATUS:-unknown}\\\" \\\"${SUMMARY:-no summary}\\\" > /tmp/batch-results/{task-name}.done; echo $(date +%s) {task-name} DONE >> /tmp/batch-results/events.log\"}]}],\n      \"PostToolUse\": [{\"hooks\": [{\"type\": \"command\", \"command\": \"if echo \\\"$TOOL_INPUT\\\" | grep -q 00-state.md; then PHASE=$(grep -oP \\\"phase: \\\\K[\\\\w.]+\\\" workspaces/*/00-state.md 2>/dev/null | head -1); printf \\\"%s|%s\\\\n\\\" \\\"{task-name}\\\" \\\"${PHASE:-unknown}\\\" > /tmp/batch-results/{task-name}.progress; echo $(date +%s) {task-name} PROGRESS >> /tmp/batch-results/events.log; fi\"}]}]\n    }\n  }' \\\n  -p \"/th:issue #{number} --skip-delivery\"";

// Builds the anchored exact-match exemption regex from LEGACY_TMUX_SPAWN_RAW:
// every literal character is escaped, then `{task-name}` (7 occurrences)
// becomes one capturing group plus 6 backreferences (the same task name must
// appear at every site) and `{number}` becomes a digit-bounded group. A
// reordered flag, an injected `&&`, an extra argument, a mismatched
// task-name across occurrences, or any deviation from this literal template
// fails the match (AC-6.5 anti-forgeable) and falls through to the deny
// above. Matched against the RAW command, not the normalized one — see
// module-header note on why the exemption must not run on lossy
// normalization.
function buildLegacyTmuxSpawnExemptionRegex(): RegExp {
  const escaped = escapeRegExpLiteral(LEGACY_TMUX_SPAWN_RAW);
  const withTaskName = groupRepeatedPlaceholder(
    escaped,
    escapeRegExpLiteral("{task-name}"),
    "([A-Za-z0-9._-]{1,80})",
    "\\1"
  );
  const withNumber = groupRepeatedPlaceholder(
    withTaskName,
    escapeRegExpLiteral("{number}"),
    "([0-9]{1,10})",
    "\\2"
  );
  return new RegExp(`^${withNumber}$`);
}

const LEGACY_TMUX_SPAWN_EXEMPTION_RE = buildLegacyTmuxSpawnExemptionRegex();

// Returns the deny decision when `cmd` spawns `claude --dangerously-skip-
// permissions` and is NOT the exact legacy exemption; null when the command
// does not carry the flag at all, or is exactly the exempted legacy form.
// The router regex runs against the lexically-normalized command
// (normalizeLexicalNoise) so quote/backslash-noise evasions are already
// closed before matching; the exemption regex runs against the RAW command
// (see buildLegacyTmuxSpawnExemptionRegex comment).
function evaluateClaudeSkipPermissionsSpawn(cmd: string): NormalizedDecision | null {
  if (!CLAUDE_SKIP_PERMISSIONS_RE.test(normalizeLexicalNoise(cmd))) return null;
  if (LEGACY_TMUX_SPAWN_EXEMPTION_RE.test(cmd)) return null;

  return deny(
    "spawning `claude` with --dangerously-skip-permissions bypasses every downstream hook at whatever depth the spawned process runs (SEC-DR-B). This is a best-effort text heuristic, not a security boundary — it cannot see runtime shell evaluation (variable indirection, command substitution, wrapper scripts). The hard guarantee against this bypass is AC-6.4 (native Task-tool spawn in the split path, where no Bash `claude` invocation exists to evade). The only exemption here is the exact-match legacy top-level tmux batch-spawn template, see docs/dev-mode.md § Outward-Action Gate"
  );
}

// ---------------------------------------------------------------------------
// DENIED_BASH patterns — verbatim from policy-block.sh DENIED_BASH list
// ---------------------------------------------------------------------------
const DENIED_BASH: Array<[RegExp, string]> = [
  [/\brm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?(\/|~|\$\{?HOME\}?)(\s|$)/i, "rm -rf targeting / ~ or HOME"],
  [/\brm\s+\S*[fF]\S*[rR]\S*\s+(?:--\s+)?(\/|~|\$\{?HOME\}?)(\s|$)/i, "rm -fr targeting / ~ or HOME"],
  [/\brm\s+-r\b.*\s+-f\b.*\s+(?:--\s+)?(\/|~|\$\{?HOME\}?)(\s|$)/i, "rm -r -f targeting / ~ or HOME"],
  [/\brm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?\*(\s|$)/i, "rm -rf with bare wildcard"],
  [/git\s+push\s+(?:[^|]*\s)?(-f\b|--force\b|--force-with-lease)/i, "git push --force"],
  [/git\s+reset\s+--hard\b/i, "git reset --hard"],
  [/git\s+clean\s+(?:[^|]*\s)?-\S*f/i, "git clean -f"],
  [/\bdrop\s+(?:table|database|schema)\b/i, "destructive SQL: DROP"],
  [/\btruncate\s+table\b/i, "destructive SQL: TRUNCATE TABLE"],
];

// ---------------------------------------------------------------------------
// SENSITIVE_PATHS — verbatim from policy-block.sh SENSITIVE_PATHS list
// ---------------------------------------------------------------------------
const SENSITIVE_PATHS: RegExp[] = [
  /(^|[/\\])\.env(\.|$)/,
  /\.pem$/,
  /(^|[/\\])id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,
  /(^|[/\\])\.ssh[/\\]/,
  /(^|[/\\])\.aws[/\\](credentials|config)$/,
  /(^|[/\\])credentials\.json$/,
  /(^|[/\\])secrets\.(ya?ml|json|toml)$/,
];

// Allowlist suffixes exempt from write and read guards.
const SENSITIVE_ALLOWLIST = [".env.example", ".env.sample", ".env.template"] as const;

// ---------------------------------------------------------------------------
// EGRESS_READ_PATHS — verbatim from policy-block.sh EGRESS_READ_PATHS list
// ---------------------------------------------------------------------------
const EGRESS_READ_PATHS: RegExp[] = [
  /(^|[/\\])\.env(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /(^|[/\\])id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,
  /(^|[/\\])\.ssh[/\\]/,
  /(^|[/\\])\.aws[/\\](credentials|config)$/,
  /(^|[/\\])credentials\.json$/,
  /(^|[/\\])secrets\.(ya?ml|json|toml)$/,
  /(^|[/\\])[^/\\]*secret[^/\\]*$/i,
];

// ---------------------------------------------------------------------------
// CONFIG_WEAKENING_PATHS — linter/formatter config files (M3b)
// ---------------------------------------------------------------------------
const CONFIG_WEAKENING_PATHS =
  /(^|[/\\])(\.eslintrc(\.(js|cjs|json|yaml|yml))?|eslint\.config\.(js|cjs|mjs|ts)|\.prettierrc(\.(js|cjs|json|yaml|yml))?|prettier\.config\.(js|cjs|mjs)|ruff\.toml|\.ruff\.toml|pyproject\.toml|tsconfig.*\.json)$/i;

// ---------------------------------------------------------------------------
// CONFIG_WEAKENING_PATTERNS — verbatim from policy-block.sh (M3b)
// ---------------------------------------------------------------------------
const CONFIG_WEAKENING_PATTERNS: Array<[RegExp, string]> = [
  [/"rules"\s*:\s*\{\s*\}/m, 'rules object emptied ("rules": {})'],
  [/'rules'\s*:\s*\{\s*\}/m, "rules object emptied ('rules': {})"],
  [/\/\*\s*eslint-disable\b/m, "broad eslint-disable block comment"],
  [/\/\/\s*eslint-disable\b(?!\s*eslint-enable)/m, "eslint-disable line comment (no matching enable)"],
  [/"extends"\s*:\s*\[\s*\]/m, 'extends array emptied ("extends": [])'],
  [/"plugins"\s*:\s*\{\s*\}/m, "plugins object emptied"],
  [/"noImplicitAny"\s*:\s*false/m, "TypeScript noImplicitAny disabled"],
  [/"strict"\s*:\s*false/m, "TypeScript strict mode disabled"],
  [/select\s*=\s*\[\s*\]/m, "ruff: all rules deselected"],
  [/ignore-errors\s*=\s*true/m, "ruff: ignore-errors enabled"],
];

// ---------------------------------------------------------------------------
// HIGH_CONFIDENCE_SECRETS — verbatim from policy-block.sh (14 classes)
// Reason names the CLASS, never the matched value (CWE-200 / AC-15).
// sk-ant- MUST precede the generic sk-(proj-|svcacct-)? pattern (same fire
// order as the Bash oracle) so an Anthropic key gets its own labelled deny
// instead of falling through to the generic OpenAI-style label.
// ---------------------------------------------------------------------------
const HIGH_CONFIDENCE_SECRETS: Array<[RegExp, string]> = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key (AKIA… pattern)"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "GitHub personal access token (ghp_… pattern)"],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "GitHub fine-grained PAT (github_pat_… pattern)"],
  [/-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----/, "PEM private key header"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, "Anthropic API key (sk-ant-… pattern)"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/, "OpenAI-style secret key (sk-… pattern)"],
  [/\bAIza[0-9A-Za-z_\-]{35}\b/, "Google API key (AIza… pattern)"],
  [/\b[rs]k_live_[0-9A-Za-z]{16,}\b/, "Stripe live secret key (sk_live_/rk_live_ pattern)"],
  [/\bglpat-[0-9A-Za-z_\-]{20}\b/, "GitLab personal access token (glpat-… pattern)"],
  [/\bgh[osru]_[A-Za-z0-9]{36}\b/, "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)"],
  [/\bxoxb-[A-Za-z0-9-]{10,}\b/, "Slack bot token (xoxb-… pattern)"],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, "SendGrid API key (SG.… pattern)"],
  [/\bAC[0-9a-f]{32}\b/, "Twilio account SID (AC… pattern)"],
  [/\bSK[0-9a-f]{32}\b/, "Twilio API key SID (SK… pattern)"],
];

// ---------------------------------------------------------------------------
// MEDIUM_CONFIDENCE_SECRETS_FIXED — verbatim from policy-block.sh (3 classes)
// Fixed-shape medium-confidence patterns, routed to ask() (not deny()) —
// entropy gating does not apply to these (the shape itself is the signal).
// ---------------------------------------------------------------------------
const MEDIUM_CONFIDENCE_SECRETS_FIXED: Array<[RegExp, string]> = [
  [
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    "possible JWT token (eyJ… three-segment base64url pattern)",
  ],
  [
    /\bBearer\s+[A-Za-z0-9_/+.=-]{20,}\b/,
    "possible Bearer token (Bearer … keyword pattern)",
  ],
  [
    /\bsv=[0-9]{4}-[0-9]{2}-[0-9]{2}&[^\s'"]{30,}\b/,
    "possible Azure SAS token (sv=… signature pattern)",
  ],
];

// ---------------------------------------------------------------------------
// MEDIUM_CONFIDENCE_PATTERN — AC-9: JS RegExp port of Python's MEDIUM_CONFIDENCE_PATTERN.
//
// Python original (re.MULTILINE + re.IGNORECASE):
//   (?i)(?:^|[\s\x00-\x1f])(?:\w+_)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*["']?([A-Za-z0-9_/+.]{20,})["']?
//
// JS port notes (AC-9 divergence coverage):
//   - Python's ^ under re.MULTILINE matches start-of-line; JS uses /m flag for same.
//   - Python's \s matches Unicode whitespace; JS's \s also matches Unicode whitespace
//     in ES2015+ — they behave identically on the ASCII whitespace subset.
//     The test fixtures for AC-9 cover ASCII whitespace, where both engines agree.
//   - The [\s\x00-\x1f] group: JS \s covers \x09-\x0D and \x20 (ASCII whitespace).
//     \x00-\x1f adds C0 control chars not in \s. The JS class [\s\x00-\x1f] is
//     equivalent to [\x00-\x1f\x20\x09-\x0D\xA0...] — a superset of Python's \s
//     for ASCII inputs (which is the realistic attack surface). Safe to port directly.
//   - (?:\w+_)? before the keyword: JS \w = [A-Za-z0-9_], same as Python in ASCII mode.
//   - Capturing group 1 is the potential secret value.
//
// The fail-safe rule: if a last-bit divergence is unavoidable at the 3.5 boundary
// (see shannonEntropy note), the conservative side (ask) is chosen.
// ---------------------------------------------------------------------------
const MEDIUM_CONFIDENCE_PATTERN =
  /(?:^|[\s\x00-\x1f])(?:\w+_)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*["']?([A-Za-z0-9_/+.]{20,})["']?/gim;

// ---------------------------------------------------------------------------
// shannonEntropy — inline TS port of Python's shannon_entropy function.
// Formula: -sum((c/n) * log2(c/n)) for each character frequency c out of n.
//
// Python: math.log2(x) — same formula as Math.log2(x) in JS (both IEEE-754 double).
// AC-9: the boundary at 3.5 bits/char must be identical on Python, Node, and Bun.
// Both Python (3.x) and JS engines use IEEE-754 double for floating-point math;
// Math.log2 and math.log2 are both computed via the same underlying FP instruction
// on x86-64 (VFMADD + software reduction). In practice, at the boundary strings
// used in the test suite, the results are bit-identical.
// If a last-bit divergence is ever observed, the fail-safe side (ask) is chosen
// (implemented via >= 3.5 threshold — matching the Python: `entropy >= 3.5`).
// ---------------------------------------------------------------------------
function shannonEntropy(value: string): number {
  if (!value) return 0.0;
  const freq: Map<string, number> = new Map();
  for (const ch of value) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  const n = value.length;
  let entropy = 0.0;
  for (const count of freq.values()) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ---------------------------------------------------------------------------
// Position-aware --no-verify tokenizer — verbatim port of Python check_no_verify_tokenized
//
// SEC-001 evasion forms:
//   --no-verify (exact), unambiguous prefix from --no-v, -n (commit only),
//   -nm/-vn/etc. (short-flag cluster containing 'n', commit only).
//
// Tokenization: JS shlex-equivalent using a state machine (mirrors Python shlex.split).
// Falls back to false (no-decision) on malformed quoting.
//
// SEC-010: command-substitution / variable-expansion forms evade any static tokenizer.
// This is a documented residual limit (structurally unfixable without a shell interpreter).
// ---------------------------------------------------------------------------

/** Parse a shell command string into tokens, respecting double/single quoting.
 *  Returns null on malformed quoting (unclosed quote). */
function shellSplit(cmd: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let i = 0;
  let inDQ = false;
  let inSQ = false;

  while (i < cmd.length) {
    const ch = cmd[i];

    if (inSQ) {
      if (ch === "'") {
        inSQ = false;
      } else {
        current += ch;
      }
      i++;
      continue;
    }

    if (inDQ) {
      if (ch === '"') {
        inDQ = false;
      } else if (ch === "\\") {
        i++;
        if (i < cmd.length) {
          const nc = cmd[i];
          // Inside double-quotes only \", \\, \$, \` are true escapes.
          if (nc === '"' || nc === "\\" || nc === "$" || nc === "`") {
            current += nc;
          } else {
            current += "\\" + nc;
          }
        }
      } else {
        current += ch;
      }
      i++;
      continue;
    }

    // Unquoted
    if (ch === " " || ch === "\t" || ch === "\n") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else if (ch === '"') {
      inDQ = true;
    } else if (ch === "'") {
      inSQ = true;
    } else if (ch === "\\") {
      i++;
      if (i < cmd.length) {
        current += cmd[i];
      }
    } else {
      current += ch;
    }
    i++;
  }

  // Unclosed quotes = malformed
  if (inDQ || inSQ) return null;

  if (current.length > 0) tokens.push(current);
  return tokens;
}

function checkNoVerifyTokenized(cmd: string): boolean {
  // Quick pre-filter: only relevant for git commit/rebase/push.
  if (!/\bgit\b/i.test(cmd)) return false;
  if (!/\b(commit|rebase|push)\b/i.test(cmd)) return false;

  const tokens = shellSplit(cmd);
  if (tokens === null) {
    // Malformed quoting — cannot tokenize safely; do not deny.
    return false;
  }

  const VALUE_FLAGS = new Set(["-m", "--message", "-F", "--file", "-t", "--template"]);
  let skipNext = false;
  let inGitSubcommand = false;
  let sawGit = false;
  let gitSubcommand = "";
  let pendingC = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (!sawGit) {
      if (tok === "git" || tok.endsWith("/git") || tok.endsWith("\\git")) {
        sawGit = true;
      }
      continue;
    }

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (pendingC) {
      pendingC = false;
      if (/core\.hooksPath\s*=/i.test(tok)) return true;
      continue;
    }

    // After `git`, first non-flag token is the subcommand.
    if (!inGitSubcommand && !tok.startsWith("-")) {
      inGitSubcommand = true;
      gitSubcommand = tok.toLowerCase();
      continue;
    }

    if (VALUE_FLAGS.has(tok)) {
      skipNext = true;
      continue;
    }

    // --message=VALUE or --file=VALUE inline form
    if (tok.startsWith("--message=") || tok.startsWith("--file=")) {
      continue;
    }

    // -c key=value
    if (tok === "-c") {
      pendingC = true;
      continue;
    }
    if (tok.startsWith("-c=")) {
      const kv = tok.slice(3);
      if (/core\.hooksPath\s*=/i.test(kv)) return true;
      continue;
    }

    // SEC-001: --no-verify and unambiguous prefix abbreviations.
    if (tok === "--no-verify" || ("--no-verify".startsWith(tok) && tok.startsWith("--no-v"))) {
      return true;
    }

    // SEC-001: -n / short-flag cluster containing 'n' — commit only.
    if (gitSubcommand === "commit" && /^-[A-Za-z]*n[A-Za-z]*$/.test(tok)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// scanForSecrets — scan content for high/medium confidence secrets.
// Never emits the matched value — only the pattern class name (CWE-200).
// ---------------------------------------------------------------------------
function scanForSecrets(content: string): NormalizedDecision | null {
  // High-confidence: deny on first match.
  for (const [pattern, label] of HIGH_CONFIDENCE_SECRETS) {
    if (pattern.test(content)) {
      return deny(`high-confidence secret detected: ${label}`);
    }
  }

  // Medium-confidence fixed-shape patterns (JWT, Bearer, Azure SAS) — ask.
  for (const [pattern, label] of MEDIUM_CONFIDENCE_SECRETS_FIXED) {
    if (pattern.test(content)) {
      return ask(`possible secret detected: ${label}`);
    }
  }

  // Medium-confidence: entropy-gated ask.
  // Reset global regex lastIndex before iteration.
  MEDIUM_CONFIDENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MEDIUM_CONFIDENCE_PATTERN.exec(content)) !== null) {
    // Strip any trailing quote captured as part of the ≥20-char value.
    const candidate = (match[1] ?? "").replace(/["']$/, "");
    if (candidate.length >= 20 && shannonEntropy(candidate) >= 3.5) {
      // Extract the keyword name for the reason (no matched value emitted).
      const raw = match[0].trimStart();
      const keyword = (raw.split("=")[0] ?? raw.split(":")[0] ?? raw).trim();
      return ask(`high-entropy ${keyword}= assignment (medium-confidence secret)`);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public evaluate() — the single entry point every runtime calls.
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput): NormalizedDecision {
  const toolName = input.tool?.name ?? "";
  const toolInput = input.tool?.input ?? {};

  // ---------------------------------------------------------------------------
  // Bash gate
  // ---------------------------------------------------------------------------
  if (toolName === "Bash") {
    const cmd = typeof toolInput["command"] === "string" ? (toolInput["command"] as string) : "";
    if (!cmd) return none();

    // AC-6.2/SEC-DR-B — best-effort skip-permissions spawn heuristic
    // (checked first: a skip-permissions spawn is the highest-severity
    // covered action, since it bypasses every OTHER check in this file at
    // whatever depth it runs).
    const skipPermissionsDecision = evaluateClaudeSkipPermissionsSpawn(cmd);
    if (skipPermissionsDecision) return skipPermissionsDecision;

    // DENIED_BASH patterns
    for (const [pattern, label] of DENIED_BASH) {
      if (pattern.test(cmd)) return deny(label);
    }

    // Position-aware --no-verify / -c core.hooksPath= tokenizer (M3c).
    if (checkNoVerifyTokenized(cmd)) {
      return deny("--no-verify (bypasses pre-commit hooks)");
    }

    // Secret scan on Bash commands that can carry secrets inline.
    // Broadened from git-commit-only to also cover curl/wget --data forms,
    // tee redirection (tee file << EOF), and env/export assignments —
    // verbatim parity with policy-block.sh's _should_scan_bash gate.
    //
    // The curl predicate covers every flag shape that can carry a body or a
    // credential: -d/--data(-raw|-binary|-urlencode), --json, -F/--form
    // (multipart), and an Authorization: Bearer header via -H or --header
    // (curl treats them as equivalent) — curl -H 'Authorization: Bearer …'
    // has no --data at all yet still exfiltrates a secret, which the
    // original --data-only predicate missed.
    const curlCarriesData =
      /\bcurl\b.*(?:--data(?:-[a-z]+)?\b|\s-d\b|--json\b|\s-F\b|--form\b)/i.test(cmd);
    const curlCarriesAuthHeader = /\bcurl\b.*(?:-H|--header)\s+['"]?Authorization:\s*Bearer\b/i.test(cmd);
    const shouldScanBash =
      /\bgit\s+commit\b/.test(cmd) ||
      curlCarriesData ||
      curlCarriesAuthHeader ||
      /\bwget\b.*--post-(?:data|file)\b/i.test(cmd) ||
      /\btee\b/.test(cmd) ||
      /\bexport\s+\w+\s*=/.test(cmd) ||
      /\benv\s+\w+=/.test(cmd);
    if (shouldScanBash) {
      const secretDecision = scanForSecrets(cmd);
      if (secretDecision !== null) return secretDecision;
    }

    return none();
  }

  // ---------------------------------------------------------------------------
  // Read gate — M3a: egress guard on secret/credential paths.
  // ---------------------------------------------------------------------------
  if (toolName === "Read") {
    const rawPath = typeof toolInput["file_path"] === "string" ? (toolInput["file_path"] as string) : "";
    // Normalize Windows backslash separators.
    const filePath = rawPath.replace(/\\/g, "/");

    // Allowlist: .env.example / .env.sample / .env.template
    if (SENSITIVE_ALLOWLIST.some((suffix) => filePath.endsWith(suffix))) {
      return none();
    }

    for (const pattern of EGRESS_READ_PATHS) {
      if (pattern.test(filePath)) {
        return askReason(
          `reading a potential secret/credential file ('${rawPath}'). Confirm this read is intentional and the file does not contain live secrets.`
        );
      }
    }

    return none();
  }

  // ---------------------------------------------------------------------------
  // Write / Edit / NotebookEdit gate
  // ---------------------------------------------------------------------------
  if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    const rawPath =
      typeof toolInput["file_path"] === "string" ? (toolInput["file_path"] as string) : "";
    // F-015: normalize Windows backslash separators before SENSITIVE_PATHS matching.
    const filePath = rawPath.replace(/\\/g, "/");

    // Allowlist: .env.example / .env.sample / .env.template
    if (SENSITIVE_ALLOWLIST.some((suffix) => filePath.endsWith(suffix))) {
      return none();
    }

    // SENSITIVE_PATHS check.
    for (const pattern of SENSITIVE_PATHS) {
      if (pattern.test(filePath)) {
        return deny(`writing to sensitive file '${rawPath}'`);
      }
    }

    // M3b — config-anti-weakening.
    if (CONFIG_WEAKENING_PATHS.test(filePath)) {
      const contentField =
        toolName === "Write" ? "content" : toolName === "Edit" ? "new_string" : "new_source";
      const contentToCheck =
        typeof toolInput[contentField] === "string" ? (toolInput[contentField] as string) : "";
      if (contentToCheck) {
        for (const [pattern, label] of CONFIG_WEAKENING_PATTERNS) {
          if (pattern.test(contentToCheck)) {
            return askReason(
              `edit may weaken linter/formatter config '${rawPath}' (${label}). Confirm this change is intentional.`
            );
          }
        }
      }
    }

    // Secret scan on file content.
    const contentField =
      toolName === "Write" ? "content" : toolName === "Edit" ? "new_string" : "new_source";
    const content =
      typeof toolInput[contentField] === "string" ? (toolInput[contentField] as string) : "";
    if (content) {
      const secretDecision = scanForSecrets(content);
      if (secretDecision !== null) return secretDecision;
    }

    return none();
  }

  // Unknown tool — no decision.
  return none();
}
