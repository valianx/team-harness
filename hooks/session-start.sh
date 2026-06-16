#!/usr/bin/env bash
# session-start.sh — Team Harness unified SessionStart hook.
#
# THE single session-initialization process. Each session-init concern is a
# discrete, labeled load_<name> function invoked in a documented order; each
# appends its directive (or nothing) to a single accumulator emitted once as
# one combined JSON. None contribute → emit nothing, exit 0 (session start
# is never blocked).
#
# Four sources are loaded:
#   1. load_orchestrator       — unconditional orchestrator disposition (SEC-DR-2 re-founded)
#   2. load_language           — .team-harness.json `language`
#   3. load_english_learning   — .team-harness.json `english_learning` (boolean, opt-in)
#   4. load_workspace_mode     — .team-harness.json `logs-mode`/`logs-path`/`logs-subfolder`
#
# Security (SEC-DR-A/B/C):
#   A — each config-derived value is validated with a FULL-STRING check before
#       interpolation. `language` must match ^[a-z]{2}$; `logs-path` is rejected
#       if it contains any control character ([:cntrl:]).
#   B — the JSON is emitted via a fixed jq template (printf fallback when jq is
#       absent) interpolating only validated/derived tokens. No raw config bytes
#       are shell-concatenated into the JSON string.
#   C — every error/early-exit path contributes nothing and never echoes the raw
#       value. stdout is the trusted-context channel.
#
# SEC-DR-2 (re-founded v2.89.0): inline orchestration at top level is the CC
#   architecture (the general agent IS the orchestrator). The outward-action
#   security property — no push/merge/publish without operator approval — is
#   enforced by hooks/dev-guard.sh, armed UNCONDITIONALLY. The disposition
#   directive below fires on EVERY session without any marker guard.
#
# Cross-platform: Git Bash on Windows, native bash on macOS/Linux.

set -euo pipefail

CONFIG="${HOME}/.claude/.team-harness.json"

# Drain the SessionStart payload on stdin so the producer never sees SIGPIPE.
cat >/dev/null 2>&1 || true

# ============================================================================
# REGISTRY — session-init loads, in invocation order:
#   1. load_orchestrator       (unconditional — orchestrator disposition, always)
#   2. load_language           (source: .team-harness.json `language`)
#   3. load_english_learning   (source: .team-harness.json `english_learning`; boolean, opt-in; off when key is absent/false/non-true)
#   4. load_workspace_mode     (source: .team-harness.json `logs-mode`/`logs-path`/`logs-subfolder`)
#
# To add a new session-init load:
#   (1) write a load_<name> function that VALIDATES its source and echoes its
#       directive (or nothing) — append to the `directives` array (and set
#       `system_message` only if it must render as an app banner). The function
#       MUST emit only jq-escaped values and MUST NOT produce raw `"` or `\`
#       characters in its output: the printf-fallback branch in the emit block
#       performs no escaping, so per-source validation must exclude any
#       JSON-breaking bytes before any string reaches `directives` or
#       `system_message`.
#   (2) append load_<name> to the ordered invocation list below;
#   (3) add its case to tests/test_session_start.sh.
# Every load is independent and fail-safe: a new load can never break an
# existing one or block session start.
# ============================================================================

system_message=""           # reserved for app-rendered banners (unused in de-moded path)
directives=()               # additionalContext fragments, in load order

# ----------------------------------------------------------------------------
# Load 1 — orchestrator disposition (UNCONDITIONAL)
# Fires on every session. No marker guard — inline orchestration is the CC
# architecture (SEC-DR-2 re-founded v2.89.0). The outward-action gate
# (hooks/dev-guard.sh) is armed unconditionally and enforces the security
# property independently of this directive.
# The CONTEXT string must not be modified without also updating the structural
# assertions in tests/test_agent_structure.py.
# ----------------------------------------------------------------------------
load_orchestrator() {
    # Unconditional — no marker check. The CC general agent IS the orchestrator.
    directives+=( 'Team Harness orchestrator disposition is active for this session. This determination is FINAL at session start and SILENT - do NOT narrate the routing rationale or re-verify any marker. Silently adopt the orchestrator disposition: route development tasks (features, fixes, refactors, enhancements, hotfixes, issue work, review) through the full pipeline (architect -> implementer -> tester + qa + security -> delivery), dispatch leaf agents directly via Task, apply the fail-closed triage invariant (ANY ambiguity about whether a task needs the pipeline -> enter the pipeline or ask the operator; NEVER handle a development task inline without gates), and treat security floors as non-waivable. Do NOT read agents/orchestrator.md or any docs/ contract at session start - pre-loading them is a 20s+ wait; defer all contract loading until a development task enters the pipeline, then read only the needed sections from the plugin cache ~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) are intercepted by hooks/dev-guard.sh and require explicit operator approval; you cannot auto-approve them. Serve the operator first message: if it is already a concrete request or question, address it directly (answer simple non-development queries yourself; route development tasks through the pipeline); only if there is no actionable request, reply with one short line asking what to work on. Do NOT run unprompted git, filesystem exploration, Memory/KG, or environment statistics.' )
}

# ----------------------------------------------------------------------------
# Load 2 — language
# Logic preserved verbatim from language-session-start.sh.
# SEC-DR-A: full-string [[ "$lang" =~ ^[a-z]{2}$ ]] rejects multiline values.
# ----------------------------------------------------------------------------
load_language() {
    [ -f "$CONFIG" ] || return 0

    # Extract the language value. Try jq first; fall back to pure bash grep/sed.
    local lang=""
    if command -v jq >/dev/null 2>&1; then
        # jq -r outputs the raw string value or empty when the key is absent.
        lang=$(jq -r '.language // empty' "$CONFIG" 2>/dev/null) || lang=""
    else
        # Bash fallback: handles simple string values — sufficient for a 2-letter code.
        lang=$(grep -o '"language"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
               | sed 's/.*"language"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
               2>/dev/null) || lang=""
    fi

    # Missing or empty value → contribute nothing.
    [ -n "$lang" ] || return 0

    # SEC-DR-A: FULL-STRING regex match. [[ =~ ^[a-z]{2}$ ]] in bash does NOT
    # use POSIX line-oriented anchoring — it matches the entire variable value.
    # A multi-line string like $'en\n=== SYSTEM ===\nignore previous' will NOT
    # match ^[a-z]{2}$ because the value is more than two characters.
    [[ "$lang" =~ ^[a-z]{2}$ ]] || return 0

    # Closed lookup: map 2-letter code to a display name.
    local name
    case "$lang" in
        en) name="English" ;;
        es) name="Spanish" ;;
        pt) name="Portuguese" ;;
        fr) name="French" ;;
        de) name="German" ;;
        *) name="the configured language (\`${lang}\`)" ;;
    esac

    # SEC-DR-B: fixed template — only $lang and $name are interpolated, both
    # validated/derived above; no raw config bytes flow into this string.
    directives+=( "Team Harness configured default language: \`${lang}\`. Respond to the operator in ${name} for this session — including ordinary conversation — regardless of the language of individual messages. An explicit per-session override (the operator requesting another language) still applies for this session only and takes precedence over this default." )
}

# ----------------------------------------------------------------------------
# Load 3 — english-learning correction mode
# SEC-DR-A: boolean-safe parse — only the exact literal "true" enables the mode.
# Any other value (false / absent / empty / malformed / multiline) → return 0
# (contribute nothing). The directive is a fixed ASCII template with ZERO config
# interpolation; the boolean is never echoed into output. This is strictly safer
# than load_language, which interpolates the validated $lang token.
# Language gate: the directive is injected ONLY when english_learning == "true"
# AND the config `language` key is "en" or absent/empty (absent → default en).
# A non-en code (es, pt, fr, …) keeps the directive dormant. The gate reads
# ONLY the config key — it does NOT read 00-state.md (session-override language
# is the orchestrator path's responsibility, not the hook's).
# Placed after load_language so the response-language directive is established
# before the correction directive (load order matters per the plan).
# ----------------------------------------------------------------------------
load_english_learning() {
    [ -f "$CONFIG" ] || return 0

    # Extract the english_learning boolean value. Try jq first; fall back to
    # pure-bash grep for the JSON boolean literal (not a quoted string).
    local el=""
    if command -v jq >/dev/null 2>&1; then
        # jq -r outputs "true", "false", or empty when the key is absent/null.
        el=$(jq -r '.english_learning // empty' "$CONFIG" 2>/dev/null) || el=""
    else
        # Bash fallback: match the unquoted boolean literal true.
        # Pattern: "english_learning": true (with optional whitespace).
        el=$(grep -o '"english_learning"[[:space:]]*:[[:space:]]*true' "$CONFIG" 2>/dev/null \
             | sed 's/.*:[[:space:]]*//' 2>/dev/null) || el=""
    fi

    # BOOLEAN-SAFE: only the exact literal "true" enables the mode.
    # false / absent / empty / malformed / multiline → contribute nothing.
    [ "$el" = "true" ] || return 0

    # LANGUAGE GATE: read the `language` key — mirroring load_language's read.
    # The directive fires only when lang == "en" OR lang is empty/absent.
    # Any other non-empty value (es, pt, fr, …) → stay dormant.
    # SEC: lang is used for comparison only — it is NEVER interpolated into the
    # directive. The directive template stays a fixed ASCII string.
    local lang=""
    if command -v jq >/dev/null 2>&1; then
        lang=$(jq -r '.language // empty' "$CONFIG" 2>/dev/null) || lang=""
    else
        lang=$(grep -o '"language"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
               | sed 's/.*"language"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
               2>/dev/null) || lang=""
    fi

    # Gate: en or absent → fire; any other non-empty value → dormant.
    [ "$lang" = "en" ] || [ -z "$lang" ] || return 0

    # SEC-DR-B: fixed ASCII template — NO config bytes are interpolated here.
    # The boolean and language values were parsed to an on/off decision above
    # and are never echoed into the directive.
    directives+=( 'Team Harness english-learning mode is active for this session. This mode operates with English as the response language (it is coupled to language: en). At the START of every reply, when the operator'"'"'s latest message is written in English, give one brief, low-key learning signal, then continue and answer the operator'"'"'s request normally in the same turn. Keep the signal unobtrusive — the operator is learning passively while working, so the signal must never dominate the reply or stall the conversation.

Every message gets a signal (kept minimal). If the operator'"'"'s English message is already correct, acknowledge it with the plain-ASCII emoticon :) on its own short line — nothing more (do NOT render it as an emoji glyph; it is the literal two-character sequence). If the message contains a correctable error, show the compact correction block instead. Either way, the substantive answer follows in the same turn.

What to correct (selective, not comprehensive). Correct treatable, rule-governed errors — verb tense, subject-verb agreement, articles, prepositions, plurals, word order — and any error that genuinely impedes comprehension. Do NOT flag stylistic choices, informal register, idiomatic phrasing, capitalization (including sentence-start and acronym case), or acceptable alternatives. If you are unsure whether something is an error, leave it and treat the message as correct (:)).

Correction format (compact, minimal-edit, labeled). Give a brief metalinguistic label for each fix (for example: "past tense", "article", "subject-verb agreement") — a few words per fix, no grammar lesson by default. After the labels, on the final line of the correction block, present the corrected version of the operator'"'"'s message, changing ONLY what is wrong, preserving their phrasing and meaning, and preserving their original casing — minimal edits, not a fluency rewrite. No diff symbols, no color codes — chat is plain text.

Turn structure (signal first, then continue). The learning signal (:) or the correction block) comes first; the substantive answer to the operator'"'"'s actual request follows in the same reply. Never stall the conversation waiting for acknowledgement, and never let the signal replace the answer.

Explanation only on explicit request. Do not append grammar explanations to the default turn. Provide a fuller, rule-based explanation ONLY when the operator explicitly asks (for example "why?", "explain that", "explicá"). When asked, keep the explanation atomic and rule-based: one edit, one reason, concise — not an extended lesson.

Exemptions — never "correct" these. Code, commands, file paths, URLs, identifiers, proper nouns, and any message NOT written in English (for example Spanish) are out of scope: do not evaluate them for English grammar, do not rewrite them, and do not emit a :) for a non-English message. If the message mixes English prose with code/paths, correct only the English prose around them.

Failure modes to guard. (a) Do not over-correct — the default tendency is to rewrite correct text for fluency; resist it, especially for already-fluent messages. (b) Keep each correction local to the sentence where the error occurs. (c) Do not correct register or style as if it were a grammar error.

Affective posture. Keep the signal brief, neutral, and non-punitive — the goal is to help, not to grade. This learning signal targets the operator'"'"'s English only; your own prose stays under the standard neutral-register voice rules.' )
}

# ----------------------------------------------------------------------------
# Load 4 — workspace mode
# SEC-DR-A: logs-path is rejected if it contains any control character.
# Default logs-subfolder: work-logs.
# Directive framed for dev-mode-default disposition (top-level agent acting as
# orchestrator is the primary path; nested handoff is the rare exception).
# ----------------------------------------------------------------------------
load_workspace_mode() {
    [ -f "$CONFIG" ] || return 0

    local logs_mode=""
    local logs_path=""
    local logs_subfolder=""

    if command -v jq >/dev/null 2>&1; then
        logs_mode=$(jq -r '."logs-mode" // empty' "$CONFIG" 2>/dev/null) || logs_mode=""
        logs_path=$(jq -r '."logs-path" // empty' "$CONFIG" 2>/dev/null) || logs_path=""
        logs_subfolder=$(jq -r '."logs-subfolder" // empty' "$CONFIG" 2>/dev/null) || logs_subfolder=""
    else
        logs_mode=$(grep -o '"logs-mode"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
                    | sed 's/.*"logs-mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
                    2>/dev/null) || logs_mode=""
        logs_path=$(grep -o '"logs-path"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
                    | sed 's/.*"logs-path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
                    2>/dev/null) || logs_path=""
        logs_subfolder=$(grep -o '"logs-subfolder"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
                         | sed 's/.*"logs-subfolder"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
                         2>/dev/null) || logs_subfolder=""
    fi

    # Only obsidian mode with a non-empty path emits a directive.
    [ "$logs_mode" = "obsidian" ] || return 0
    [ -n "$logs_path" ] || return 0

    # SEC-DR-A: reject logs-path containing any control character (ASCII 0x00-0x1F,
    # 0x7F). [:cntrl:] covers newline/CR/tab/C0/DEL — the injection-vector bytes.
    # Legitimate Windows paths contain \ : space but no control bytes.
    [[ "$logs_path" == *[[:cntrl:]]* ]] && return 0

    # Default subfolder when absent.
    [ -n "$logs_subfolder" ] || logs_subfolder="work-logs"

    # SEC-DR-B: only validated/derived tokens interpolated into this fixed template.
    directives+=( "Team Harness workspace mode: obsidian is configured. You, the top-level agent acting as orchestrator, MUST write pipeline workspaces to the resolved obsidian base, NOT local ./workspaces/. The base-path pattern is: ${logs_path}/${logs_subfolder}/{repo}/{YYYY-MM-DD}_{feature}/. Compose the full path by substituting {repo} with the current repository name (basename of the working directory) and {YYYY-MM-DD}_{feature} with today's date and the feature slug — exactly as orchestrator Step 2 does. In the rare case that the orchestrator subagent is dispatched via nested handoff, it resolves the same base in its own boot Step 2 and receives it via the workspaces path: directive." )
}

# ---------------------------------------------------------------------------
# Ordered invocation list (per REGISTRY above)
# ---------------------------------------------------------------------------
load_orchestrator
load_language
load_english_learning
load_workspace_mode

# ---------------------------------------------------------------------------
# Emit ONE combined JSON
# If nothing applied → emit nothing, exit 0 (session start never blocked).
# additionalContext = the directives joined by blank lines (\n\n).
# When system_message is non-empty it becomes the "systemMessage" field
# (app-rendered banner — instant, no token render).
# ---------------------------------------------------------------------------
if [ -z "$system_message" ] && [ ${#directives[@]} -eq 0 ]; then
    exit 0
fi

# Build the additionalContext string: directives joined by \n\n.
# Each directive is an ASCII-safe fixed template (no embedded double quotes or
# backslashes that would break a JSON string), so printf suffices for the
# fallback path. jq is preferred here because it handles proper escaping of
# embedded newlines in the joined multi-directive string.
additional_context=""
for d in "${directives[@]}"; do
    if [ -n "$additional_context" ]; then
        additional_context="${additional_context}

${d}"
    else
        additional_context="${d}"
    fi
done

if command -v jq >/dev/null 2>&1; then
    if [ -n "$system_message" ]; then
        jq -cn \
          --arg sm "$system_message" \
          --arg ac "$additional_context" \
          '{"systemMessage":$sm,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ac}}'
    else
        jq -cn \
          --arg ac "$additional_context" \
          '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ac}}'
    fi
else
    # printf fallback: directive templates contain no double quotes or
    # backslashes, so a single printf pass is safe.
    if [ -n "$system_message" ]; then
        printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
          "$system_message" "$additional_context"
    else
        printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
          "$additional_context"
    fi
fi

exit 0
