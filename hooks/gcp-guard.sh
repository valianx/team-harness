#!/usr/bin/env bash
# hooks/gcp-guard.sh
# PreToolUse hook — deterministic gcloud verb-classifying gate for gcp-infra agent.
#
# Wired via hooks/config.json (Go installer) and .claude-plugin/hooks.json
# (plugin runtime) as its OWN PreToolUse entry with matcher:"Bash", SEPARATE
# from policy-block.sh and dev-guard.sh. Reads tool_input from stdin;
# intercepts gcloud commands and classifies the verb.
#
# VERB CLASSIFICATION (canonical — matches docs/gcp-infra.md):
#
#   READ-ONLY (nodecision — defer to normal flow):
#     list, describe, get / get-*, search-all-resources,
#     simulator / replay-recent-access, recommendations, print-*,
#     OR any invocation carrying --dry-run or --validate-only
#
#   MUTATING (permissionDecision: ask — operator must confirm):
#     create, update, patch, add-*, set-*, enable, disable,
#     resize, start, stop, deploy, import,
#     add-iam-policy-binding, set-iam-policy
#
#   DESTRUCTIVE (permissionDecision: ask with irreversibility reason):
#     delete, remove-*, remove-iam-policy-binding, purge, clear-*, destroy
#
#   CATASTROPHIC DENYLIST (permissionDecision: deny — blocked unconditionally):
#     projects delete, resource-manager folders delete,
#     organizations * delete
#     (any project / org / folder deletion)
#
# PRECEDENCE: the STRONGEST class across all gcloud invocations in the
# command wins (catastrophic > destructive > mutating > read-only).
#
# FAIL-CLOSED contract:
#   - Non-gcloud commands or non-Bash tool calls    -> nodecision (exit 0)
#   - gcloud + read-only verbs only                 -> nodecision (exit 0)
#   - gcloud + mutating verbs                       -> ask
#   - gcloud + destructive verbs                    -> ask (irreversibility reason)
#   - catastrophic denylist match                   -> deny
#   - Unparseable payload with "gcloud" token:
#       destructive token present                   -> ask (fail-safe)
#       catastrophic token present                  -> deny (fail-safe)
#       otherwise                                   -> nodecision
#   - NEVER returns "allow" for mutating/destructive verbs
#   - NO agent-writable self-approval marker; operator approval flows only
#     through the Claude Code permission prompt that "ask" triggers
#
# Cross-platform: runs under Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints, no personal config. CLAUDE.md §12.
#
# Exit behaviour (Claude Code hook contract):
#   exit 0 + JSON      -> Claude processes the JSON (ask or deny).
#   exit 0 + empty     -> no decision; Claude defers to the operator's
#                         normal permission flow (this hook's default).
#   Other exit         -> undefined; do not use.

set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

nodecision() {
    exit 0
}

ask() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
}

deny() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
}

# ---------------------------------------------------------------------------
# Step 1 — Read stdin
# ---------------------------------------------------------------------------
input="$(cat)"

# ---------------------------------------------------------------------------
# Step 2 — Check tool_name; only gate on Bash tool calls
# ---------------------------------------------------------------------------
_tool_name=""
if command -v python3 >/dev/null 2>&1; then
    _tool_name=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get('tool_name', ''))
except Exception:
    print('')
" <<< "$input" 2>/dev/null || true)
else
    _tool_name=$(printf '%s' "$input" \
        | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

# Non-Bash tool calls are never our concern
if [ "$_tool_name" != "Bash" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 3 — Extract the command from the JSON payload
# Python3 preferred; grep/sed fallback (F-016-safe bracket form [\\])
# ---------------------------------------------------------------------------
cmd=""
if command -v python3 >/dev/null 2>&1; then
    cmd=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    ti = data.get('tool_input', data)
    print(ti.get('command', ''))
except Exception:
    print('')
" <<< "$input" 2>/dev/null || true)
else
    # F-016-safe: bracket form [\\] matches backslash without GNU grep 3.0 bug
    cmd=$(printf '%s' "$input" \
        | grep -oE '"command"[[:space:]]*:[[:space:]]*"([\\].|[^"\\])*"' | head -1 \
        | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"(.*)"$/\1/' \
        2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# Step 4 — No gcloud token at all -> nodecision
# This is the fast-exit for the overwhelming majority of Bash commands.
# ---------------------------------------------------------------------------
if ! printf '%s' "$cmd" | grep -q 'gcloud' 2>/dev/null; then
    # Fallback: if extraction failed but raw payload contains gcloud, continue below
    if ! printf '%s' "$input" | grep -q 'gcloud' 2>/dev/null; then
        nodecision
    fi
    # Extraction failed on a payload that does contain gcloud — use raw input
    # for the fail-safe scan below
    cmd=""
fi

# ---------------------------------------------------------------------------
# Step 5 — Fail-safe path: if cmd is empty but "gcloud" appears in the raw
# payload, scan for catastrophic / destructive tokens and gate accordingly.
# Never allow on a parse failure of a gcloud-containing payload.
# ---------------------------------------------------------------------------
if [ -z "$cmd" ]; then
    # Catastrophic denylist check on raw payload
    # fix(sec-005): token-anchored organization pattern — require 'delete' as a verb
    # token (word boundary), not a substring of --filter/--format values. The
    # projects/folders patterns were already safe (verb follows immediately); only
    # the organizations branch had the greedy [^"]* that could match inside flags.
    if printf '%s' "$input" | grep -qE 'projects[[:space:]]+delete|resource-manager[[:space:]]+folders[[:space:]]+delete|organizations[[:space:]]+[^[:space:]"]+[[:space:]]+delete([[:space:]]|"|$)' 2>/dev/null; then
        deny "gcp-guard: catastrophic operation detected in unparseable payload — project/org/folder deletion is permanently blocked; run manually if truly intended (gcp-guard.sh)"
    fi
    # Destructive token check on raw payload
    if printf '%s' "$input" | grep -qE '(^|[[:space:]])(delete|remove-[a-z]|purge|clear-[a-z]|destroy)([[:space:]]|$|")' 2>/dev/null; then
        ask "gcp-guard: destructive gcloud verb detected in unparseable payload — operation requires explicit operator approval; irreversible, cannot be undone (gcp-guard.sh)"
    fi
    # Cannot determine verb from malformed input but gcloud is present — nodecision
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 6 — Classify all gcloud invocations in the command.
# Strategy: split on common command separators (&&, ;, |, newlines),
# find every "gcloud" token, extract the subcommand word(s) that follow,
# and track the strongest class seen.
#
# Class strength order: catastrophic (4) > destructive (3) > mutating (2) >
#   read-only (1) > unknown/no-gcloud (0).
# ---------------------------------------------------------------------------

# Result accumulators
_strongest_class=0   # 0=none, 1=read-only, 2=mutating, 3=destructive, 4=catastrophic
_strongest_verb=""
_strongest_resource=""

# Normalise separators to newlines for line-by-line processing
# Replace &&, ;, |, \n with newlines
_normalized=$(printf '%s' "$cmd" | tr ';&|' '\n' | tr -s ' \t' ' ')

# Process each segment
while IFS= read -r segment; do
    # Trim leading/trailing whitespace
    segment=$(printf '%s' "$segment" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

    # Skip if segment doesn't contain gcloud
    printf '%s' "$segment" | grep -q 'gcloud' 2>/dev/null || continue

    # Check for --dry-run or --validate-only anywhere in the segment
    if printf '%s' "$segment" | grep -qE '(--dry-run|--validate-only)' 2>/dev/null; then
        # Explicit dry-run / validate-only flag → treat as read-only regardless of verb
        [ "$_strongest_class" -lt 1 ] && _strongest_class=1
        continue
    fi

    # Extract words after "gcloud" to identify subcommand group(s)
    # Pattern: gcloud [flags] <group> <subgroup> <verb> [flags] [args]
    # We take up to 4 words after "gcloud" and look for the verb word
    _after_gcloud=$(printf '%s' "$segment" | sed -E 's/.*gcloud[[:space:]]+(.*)/\1/' 2>/dev/null || true)

    # Strip leading flags (words starting with --)
    _words=$(printf '%s' "$_after_gcloud" | tr ' ' '\n' | grep -v '^--' | grep -v '^$' | head -5 || true)

    # The verb is typically the last non-flag word before flags/args start
    # For gcloud, the structure is: gcloud <group> [<subgroup>] <verb> [--flags] [args]
    # We look at each word and check if it matches a known verb class

    _seg_class=0
    _seg_verb=""
    _seg_resource=""

    # Check for catastrophic patterns first (highest priority)
    # "projects delete", "resource-manager folders delete", "organizations * delete"
    if printf '%s' "$segment" | grep -qE 'gcloud[[:space:]].*projects[[:space:]]+delete' 2>/dev/null; then
        _seg_class=4
        _seg_verb="projects delete"
        _seg_resource=$(printf '%s' "$segment" | grep -oE 'projects[[:space:]]+delete[[:space:]]+[^[:space:]]+' | head -1 || true)
    elif printf '%s' "$segment" | grep -qE 'gcloud[[:space:]].*resource-manager[[:space:]]+folders[[:space:]]+delete' 2>/dev/null; then
        _seg_class=4
        _seg_verb="resource-manager folders delete"
        _seg_resource=$(printf '%s' "$segment" | grep -oE 'folders[[:space:]]+delete[[:space:]]+[^[:space:]]+' | head -1 || true)
    elif printf '%s' "$segment" | grep -qE 'gcloud[[:space:]].*organizations[[:space:]]+[^[:space:]]*[[:space:]]+delete' 2>/dev/null; then
        _seg_class=4
        _seg_verb="organizations delete"
        _seg_resource=$(printf '%s' "$segment" | grep -oE 'organizations[[:space:]]+[^[:space:]]+[[:space:]]+delete[[:space:]]+[^[:space:]]*' | head -1 || true)
    fi

    if [ "$_seg_class" -eq 0 ]; then
        # Scan each word for verb classification
        while IFS= read -r word; do
            [ -z "$word" ] && continue
            # Read-only verbs
            if printf '%s' "$word" | grep -qE '^(list|describe|search-all-resources|simulator|replay-recent-access|recommendations)$' 2>/dev/null; then
                [ "$_seg_class" -lt 1 ] && { _seg_class=1; _seg_verb="$word"; }
            elif printf '%s' "$word" | grep -qE '^(get|get-.+|print-.+)$' 2>/dev/null; then
                [ "$_seg_class" -lt 1 ] && { _seg_class=1; _seg_verb="$word"; }
            # Destructive verbs (check before mutating — delete > create)
            elif printf '%s' "$word" | grep -qE '^(delete|remove-.+|remove-iam-policy-binding|purge|clear-.+|destroy)$' 2>/dev/null; then
                [ "$_seg_class" -lt 3 ] && { _seg_class=3; _seg_verb="$word"; }
            elif [ "$word" = "remove-iam-policy-binding" ]; then
                [ "$_seg_class" -lt 3 ] && { _seg_class=3; _seg_verb="$word"; }
            # Mutating verbs
            elif printf '%s' "$word" | grep -qE '^(create|update|patch|add-.+|set-.+|enable|disable|resize|start|stop|deploy|import|add-iam-policy-binding|set-iam-policy)$' 2>/dev/null; then
                [ "$_seg_class" -lt 2 ] && { _seg_class=2; _seg_verb="$word"; }
            fi
        done <<< "$_words"

        # fix(sec-001+sec-002): full-segment destructive/catastrophic scan — catches
        # destructive verbs pushed past word 5 (bash -c "…", xargs variants) that the
        # head-5 word loop above would miss. Does NOT remove the precise word loop;
        # this is an additive strengthening pass that mirrors the fail-safe raw-$input
        # scan already applied when cmd is empty (Step 5).
        #
        # Catastrophic patterns — full-segment check (overrides any lower class):
        if printf '%s' "$segment" | grep -qE 'gcloud[[:space:]].*projects[[:space:]]+delete' 2>/dev/null; then
            _seg_class=4; _seg_verb="projects delete"
            _seg_resource=$(printf '%s' "$segment" | grep -oE 'projects[[:space:]]+delete[[:space:]]+[^[:space:]]+' | head -1 || true)
        elif printf '%s' "$segment" | grep -qE 'gcloud[[:space:]].*resource-manager[[:space:]]+folders[[:space:]]+delete' 2>/dev/null; then
            _seg_class=4; _seg_verb="resource-manager folders delete"
            _seg_resource=$(printf '%s' "$segment" | grep -oE 'folders[[:space:]]+delete[[:space:]]+[^[:space:]]+' | head -1 || true)
        elif printf '%s' "$segment" | grep -qE 'gcloud[[:space:]].*organizations[[:space:]]+[^[:space:]"]+[[:space:]]+delete([[:space:]]|"|$)' 2>/dev/null; then
            _seg_class=4; _seg_verb="organizations delete"
            _seg_resource=$(printf '%s' "$segment" | grep -oE 'organizations[[:space:]]+[^[:space:]]+[[:space:]]+delete[[:space:]]+[^[:space:]]*' | head -1 || true)
        # Destructive token anywhere in segment (raises to class 3 when not already higher):
        elif [ "$_seg_class" -lt 3 ] && printf '%s' "$segment" | grep -qE '(^|[[:space:]])(delete|destroy|purge)([[:space:]]|$)' 2>/dev/null; then
            _seg_class=3; _seg_verb="delete"
        elif [ "$_seg_class" -lt 3 ] && printf '%s' "$segment" | grep -qE '(^|[[:space:]])remove-[a-z]' 2>/dev/null; then
            _seg_class=3; _seg_verb="remove-*"
        fi
    fi

    # Update strongest class across all segments
    if [ "$_seg_class" -gt "$_strongest_class" ]; then
        _strongest_class=$_seg_class
        _strongest_verb=$_seg_verb
        _strongest_resource=$_seg_resource
    fi

    # Short-circuit: catastrophic is the maximum possible class
    [ "$_strongest_class" -ge 4 ] && break

done <<< "$_normalized"

# ---------------------------------------------------------------------------
# Step 7 — Emit decision based on strongest class
# ---------------------------------------------------------------------------

case "$_strongest_class" in
    0|1)
        # No gcloud verb classified, or read-only only — no decision
        nodecision
        ;;
    2)
        # Mutating: requires operator confirmation
        ask "gcp-guard: gcloud mutating operation '$_strongest_verb' requires explicit operator approval — this will modify GCP resources (create/update/configure/start/stop). Review the blast radius before confirming (gcp-guard.sh; see docs/gcp-infra.md)"
        ;;
    3)
        # Destructive: requires confirmation with irreversibility statement
        ask "gcp-guard: gcloud DESTRUCTIVE operation '$_strongest_verb' requires explicit operator approval — this operation is IRREVERSIBLE and will permanently delete or remove GCP resources${_strongest_resource:+ (resource: $_strongest_resource)}. Verify blast radius and confirm intentionally (gcp-guard.sh; see docs/gcp-infra.md)"
        ;;
    4)
        # Catastrophic denylist: unconditionally blocked
        deny "gcp-guard: CATASTROPHIC operation '$_strongest_verb' is permanently blocked — project/organization/folder deletion destroys all contained resources and is non-recoverable. Run manually outside Claude only if absolutely certain (gcp-guard.sh; see docs/gcp-infra.md)"
        ;;
    *)
        # Unexpected class value — fail-safe: nodecision
        nodecision
        ;;
esac
