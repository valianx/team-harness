#!/usr/bin/env bash
# hooks/prepublish-guard.sh
# PreToolUse enforcement gate — pre-publish papercut guard (block-on-condition / open-on-fault).
#
# Wired via hooks/config.json (Go installer) and .claude-plugin/hooks.json
# (plugin runtime) as its OWN PreToolUse entry with matcher:"Bash", SEPARATE
# from and AFTER dev-guard.sh. Reads tool_input from stdin; routes on the
# triggering Bash command type:
#
#   git push   → Check 1: version-bump guard
#   gh pr create → Check 2: pre-publish test guard
#   anything else → nodecision (fast exit)
#
# GATE CONTRACT: block-on-condition / open-on-fault
#   BLOCK (deny):  the two checked papercut conditions — (1) distributed assets
#     changed without a matching plugin version bump, (2) prepublish_check exits
#     non-zero.
#   FAIL-OPEN (nodecision + one-line stderr warn): EVERY evaluation fault,
#     with no unspecified branch — no git, no work-tree, unresolvable
#     origin/main, git diff error, config file present-but-unparseable, value
#     rejected by the SEC-DR-A control-char guard, neither timeout nor gtimeout
#     present, internal-timeout (exit 124), command-not-found (exit 127). A
#     guard fault NEVER blocks the operator.
#
# CHECK 1 — VERSION BUMP (git push)
#   Computes git diff --name-status origin/main...HEAD LOCALLY. If any path in
#   the diff matches agents/|skills/|hooks/, then BOTH .claude-plugin/plugin.json
#   AND .claude-plugin/marketplace.json version values must differ from
#   origin/main. Compares the version VALUE (not file presence) to guard against
#   a touch that leaves the version byte-identical (SEC-PPG-6).
#   Generic safety: .claude-plugin/plugin.json absent → no-op (other repos).
#
#   OVER-BUMP ADVISORY (runs on the no-shipped-asset early-exit path):
#   Before exiting nodecision when no agents/|skills/|hooks/ path is in the
#   diff, reads the canonical version from .claude-plugin/plugin.json at both
#   origin/main and HEAD. If the actual bump level is MINOR or higher, emits
#   an advisory WARN to stderr. Fail-open: unreadable file, missing file, or
#   unparseable version → skip advisory, nodecision silently.
#
#   BUMP-FLOOR SUB-STAGE (runs only on the Check-1 PASS path):
#   After the hard-block evaluation, derives a mechanical SemVer floor from the
#   name-status diff over shipped paths. The floor table:
#
#     D or R shipped path  → MAJOR-candidate floor
#     A shipped path       → MINOR floor
#     M-only shipped path  → PATCH floor
#
#   UNDER-BUMP: when actual < floor, emits advisory WARN to stderr (push not
#   blocked). The MAJOR/MINOR advisory messages apply; floor==patch with
#   actual==none cannot reach here (Check 1 already denied).
#
#   OVER-BUMP HARD-DENY: when actual > floor (e.g. MINOR applied on an
#   M-only/PATCH-floor diff), the push is DENIED unless a valid
#   bump-override: minor — <reason>  token is present in the push context
#   (last commit-trailer or PR-body passed via GIT_COMMIT_MSG env var).
#   The token parse:
#     - regex: ^bump-override: (minor|major) — .+$  (single-line match)
#     - rejects control chars (SEC-DR-A guard)
#     - never eval, never interpolate into deny reason
#   If a valid token is present → nodecision (allow).
#   If absent → deny() with a hardcoded literal reason (SDR-PPG-01).
#   Fail-open on any parse fault (match existing posture).
#
#   NOTE: floor=="none" cannot occur on the shipped-asset path because the
#   over-bump advisory (above) handles the no-shipped-asset case before this
#   sub-stage is ever reached.
#
#   The floor sub-stage ends at nodecision (empty stdout, exit 0) on all
#   non-deny paths. Fail-open: any version that does not match
#   ^[0-9]+\.[0-9]+\.[0-9]+$ or any sub-command fault → skip the floor
#   compare with a one-line stderr note.
#
#   Structural invariant: the hard-block deny path calls deny() (which exit 0s)
#   and therefore NEVER reaches the floor sub-stage. A WARN and a block can
#   never co-occur in the same invocation.
#
# CHECK 2 — TESTS (gh pr create)
#   Reads prepublish_check (string) from ~/.claude/.team-harness.json.
#   Undeclared/empty/rejected/unparseable → no-op (fail-open, never exec).
#   Missing timeout/gtimeout binary → skip Check 2 (no-op, no unbounded exec).
#   Exec: timeout 90s bash -lc "$prepublish_check" (variable quoted, NO eval).
#   Internal 90s timeout reserves ≥30s headroom inside the 120s entry budget
#   (see TIMEOUT BUDGET note below) so the internal timeout provably trips first.
#   Internal-timeout (124) and command-not-found (127) → guard fault → fail-open.
#   Any other non-zero exit → deny. The deny reason embeds the command JSON-escaped
#   via python3 json.dumps — NEVER raw printf '%s' (SDR-PPG-01). Captured test
#   stdout/stderr is NEVER placed in the deny reason (CWE-209 / SDR-PPG-04).
#   Bash-degraded path (no python3): deny reason omits the command entirely (fixed
#   literal pointing at the config key).
#
# TIMEOUT BUDGET (SDR-PPG-03):
#   Hook-entry timeout: 120s (configured in all wiring blocks).
#   Internal test-command timeout: 90s.
#   Check 1 and Check 2 never run in the same hook invocation (command-routed),
#   so Check 1's git plumbing does not consume the Check-2 budget. The 30s
#   headroom is a margin against stdin drain + command extraction + process-spawn
#   latency. The internal timeout provably trips before the entry timeout.
#   Entry-timeout-killed hook with no stdout → Claude Code treats as no-decision
#   (fail-open). Even if the entry timeout fires first, the worst case is a missed
#   BLOCK, never a false BLOCK.
#
# SEC-PPG-1 / AC-11: dev-guard.sh co-matches git push and gh pr create (outward-
#   action gate). This hook is a SEPARATE additive sibling. Both fire as independent
#   PreToolUse entries; most-restrictive decision wins. This hook never emits
#   permissionDecision: "allow" — only "deny" or empty stdout — so it can never
#   convert dev-guard's "ask" into an allow.
#
# AC-6 / SEC-PPG-4: this hook does NOT use set -e around the command-exec body.
#   A non-zero exit from the test command is a BLOCK decision, not a script crash.
#   Exit codes are captured explicitly.
#
# AC-12 / AC-13: this hook does NOT source _hook-profile.sh and contains NO
#   TH_HOOK_PROFILE read. It is an always-on enforcement-class gate (papercut
#   floor). This hook never emits permissionDecision: "allow".
#
# Cross-platform: runs under Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints, no personal config. CLAUDE.md §12.
#
# Exit behaviour (Claude Code hook contract):
#   exit 0 + JSON     -> Claude processes the JSON (deny).
#   exit 0 + empty    -> no decision; Claude defers to the operator's normal flow.
#   Other exit        -> undefined; do not use.

set -uo pipefail

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

nodecision() {
    # No decision: exit 0 with empty stdout. Claude Code defers to the
    # operator's normal permission flow.
    exit 0
}

deny() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
}

# semver_delta OLD NEW → prints major|minor|patch|none|unknown to stdout.
# Both arguments must match ^[0-9]+\.[0-9]+\.[0-9]+$ else "unknown".
# A downgrade or non-monotonic change returns "unknown" (fail-open).
# Pure POSIX: uses awk -F. for the split; no bc, no GNU-only flags.
semver_delta() {
    local _old="$1" _new="$2"
    # Validate both strings are X.Y.Z
    case "$_old" in
        *[!0-9.]*) printf 'unknown'; return 0 ;;
    esac
    case "$_new" in
        *[!0-9.]*) printf 'unknown'; return 0 ;;
    esac
    printf '%s' "$_old" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' 2>/dev/null || { printf 'unknown'; return 0; }
    printf '%s' "$_new" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' 2>/dev/null || { printf 'unknown'; return 0; }

    awk -F. -v old="$_old" -v new="$_new" '
    BEGIN {
        split(old, o, ".")
        split(new, n, ".")
        oM = o[1]+0; oMin = o[2]+0; oP = o[3]+0
        nM = n[1]+0; nMin = n[2]+0; nP = n[3]+0
        if (nM > oM)                           print "major"
        else if (nM == oM && nMin > oMin)      print "minor"
        else if (nM == oM && nMin == oMin && nP > oP) print "patch"
        else if (nM == oM && nMin == oMin && nP == oP) print "none"
        else                                    print "unknown"
    }' /dev/null
}

# ---------------------------------------------------------------------------
# Step 1 — Drain stdin
# NOTE: do NOT use set -e (AC-6 / SEC-PPG-4): the command-exec body captures
# exit codes explicitly; a non-zero test exit is a BLOCK decision, not a crash.
# ---------------------------------------------------------------------------
input="$(cat)"

# ---------------------------------------------------------------------------
# Step 2 — Extract tool_name; only gate on Bash tool calls
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

if [ "$_tool_name" != "Bash" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 3 — Extract the command from the JSON payload
# Python3 preferred; grep/sed fallback (F-016-safe bracket form)
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
    cmd=$(printf '%s' "$input" \
        | grep -oE '"command"[[:space:]]*:[[:space:]]*"([\\].|[^"\\])*"' | head -1 \
        | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"(.*)"$/\1/' \
        2>/dev/null || true)
fi

if [ -z "$cmd" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 4 — Route on command type
# git push → Check 1 only; gh pr create → Check 2 only; else → nodecision.
# The same push regex as dev-guard.sh:207.
# ---------------------------------------------------------------------------

_is_git_push=false
_is_gh_pr_create=false

if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)' 2>/dev/null; then
    _is_git_push=true
fi

if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+create(\s|$)' 2>/dev/null; then
    _is_gh_pr_create=true
fi

if [ "$_is_git_push" = "false" ] && [ "$_is_gh_pr_create" = "false" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 5 — Check 1: version-bump guard (runs on git push only)
# ---------------------------------------------------------------------------

if [ "$_is_git_push" = "true" ]; then

    # Generic safety: if .claude-plugin/plugin.json does not exist in the repo
    # root, this is not a team-harness repo → Check 1 is a no-op.
    if [ ! -f ".claude-plugin/plugin.json" ]; then
        nodecision
    fi

    # Guard-fault preflight: require git, a work-tree, and resolvable origin/main.
    if ! command -v git >/dev/null 2>&1; then
        printf 'prepublish-guard: git not found; skipping version-bump check\n' >&2
        nodecision
    fi

    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        printf 'prepublish-guard: not inside a git work-tree; skipping version-bump check\n' >&2
        nodecision
    fi

    if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
        printf 'prepublish-guard: origin/main does not resolve; skipping version-bump check\n' >&2
        nodecision
    fi

    # Compute the diff (--name-status gives status+TAB+path per line;
    # rename lines are R<score>TAB<old>TAB<new>). A git diff error → fail-open.
    _changed=""
    _changed=$(git diff --name-status origin/main...HEAD 2>/dev/null) || {
        printf 'prepublish-guard: git diff failed; skipping version-bump check\n' >&2
        nodecision
    }

    # If no distributed assets changed, Check 1 passes.
    # For --name-status lines: the path is the LAST field on each line.
    # Rename lines have three tab-separated fields; others have two.
    # Extract the last field and match against the shipped-path regex.
    if ! printf '%s' "$_changed" | awk -F'\t' '{print $NF}' | grep -qE '^(agents|skills|hooks)/' 2>/dev/null; then
        # No shipped asset changed. Emit an advisory WARN if the version bump
        # is MINOR or higher — a docs/tests/CI-only change is typically PATCH or none.
        # Fail-open: if .claude-plugin/plugin.json is unreadable or version is
        # non-parseable, skip the advisory and nodecision quietly.
        _no_asset_origin=""
        _no_asset_head=""

        if MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/plugin.json >/dev/null 2>&1; then
            if command -v python3 >/dev/null 2>&1; then
                _no_asset_origin=$(MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/plugin.json 2>/dev/null \
                    | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get('version', ''))
except Exception:
    print('')
" 2>/dev/null || true)
            else
                _no_asset_origin=$(MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/plugin.json 2>/dev/null \
                    | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
                    | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
            fi
        fi

        if [ -f ".claude-plugin/plugin.json" ]; then
            if command -v python3 >/dev/null 2>&1; then
                _no_asset_head=$(python3 -c "
import json, sys
try:
    data = json.load(open('.claude-plugin/plugin.json'))
    print(data.get('version', ''))
except Exception:
    print('')
" 2>/dev/null || true)
            else
                _no_asset_head=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' .claude-plugin/plugin.json 2>/dev/null \
                    | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
            fi
        fi

        if [ -n "$_no_asset_origin" ] && [ -n "$_no_asset_head" ]; then
            _no_asset_actual=$(semver_delta "$_no_asset_origin" "$_no_asset_head" 2>/dev/null) || _no_asset_actual="unknown"
            : "${_no_asset_actual:=unknown}"
            if [ "$_no_asset_actual" != "unknown" ]; then
                _no_asset_rank_actual=""
                case "$_no_asset_actual" in
                    none)  _no_asset_rank_actual=0 ;;
                    patch) _no_asset_rank_actual=1 ;;
                    minor) _no_asset_rank_actual=2 ;;
                    major) _no_asset_rank_actual=3 ;;
                    *)     _no_asset_rank_actual=-1 ;;
                esac
                if [ "$_no_asset_rank_actual" -ge 2 ] 2>/dev/null; then
                    printf 'prepublish-guard: WARN — no distributed asset (agents/|skills/|hooks/) changed in this diff, but the version bump is %s (>= MINOR). A docs/tests/CI-only change is typically none or PATCH. Confirm the level is intentional. (advisory; push not blocked)\n' \
                        "$_no_asset_actual" >&2
                fi
            fi
        fi

        nodecision
    fi

    # Distributed assets changed → verify BOTH plugin.json and marketplace.json
    # have a version value that differs from origin/main.
    # Compare version VALUE, not mere file presence (SEC-PPG-6 / AC-3).

    _plugin_head=""
    _plugin_origin=""
    _market_head=""
    _market_origin=""

    # Read HEAD version from plugin.json (already verified the file exists).
    if command -v python3 >/dev/null 2>&1; then
        _plugin_head=$(python3 -c "
import json, sys
try:
    data = json.load(open('.claude-plugin/plugin.json'))
    print(data.get('version', ''))
except Exception:
    print('')
" 2>/dev/null || true)
        _market_head=$(python3 -c "
import json, sys
try:
    data = json.load(open('.claude-plugin/marketplace.json'))
    plugins = data.get('plugins', [])
    print(plugins[0].get('version', '') if plugins else '')
except Exception:
    print('')
" 2>/dev/null || true)
    else
        _plugin_head=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' .claude-plugin/plugin.json 2>/dev/null \
            | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
        _market_head=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' .claude-plugin/marketplace.json 2>/dev/null \
            | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
    fi

    # Read origin/main version from git show.
    # MSYS_NO_PATHCONV=1 prevents MSYS path conversion on Windows Git Bash from
    # mangling the colon-separated treeish 'origin/main:.claude-plugin/...' into
    # an unresolvable path (e.g. 'C:/main/.claude-plugin/...' on some MSYS builds).
    if MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/plugin.json >/dev/null 2>&1; then
        if command -v python3 >/dev/null 2>&1; then
            _plugin_origin=$(MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/plugin.json 2>/dev/null \
                | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get('version', ''))
except Exception:
    print('')
" 2>/dev/null || true)
        else
            _plugin_origin=$(MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/plugin.json 2>/dev/null \
                | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
                | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
        fi
    fi

    if MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/marketplace.json >/dev/null 2>&1; then
        if command -v python3 >/dev/null 2>&1; then
            _market_origin=$(MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/marketplace.json 2>/dev/null \
                | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    plugins = data.get('plugins', [])
    print(plugins[0].get('version', '') if plugins else '')
except Exception:
    print('')
" 2>/dev/null || true)
        else
            _market_origin=$(MSYS_NO_PATHCONV=1 git show origin/main:.claude-plugin/marketplace.json 2>/dev/null \
                | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
                | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
        fi
    fi

    # Evaluate: both versions must be non-empty AND changed vs origin/main.
    _plugin_bumped=false
    _market_bumped=false

    if [ -n "$_plugin_head" ] && [ -n "$_plugin_origin" ] && [ "$_plugin_head" != "$_plugin_origin" ]; then
        _plugin_bumped=true
    elif [ -n "$_plugin_head" ] && [ -z "$_plugin_origin" ]; then
        # File is new in this branch (no origin/main counterpart) — treat as bumped.
        _plugin_bumped=true
    fi

    if [ -n "$_market_head" ] && [ -n "$_market_origin" ] && [ "$_market_head" != "$_market_origin" ]; then
        _market_bumped=true
    elif [ -n "$_market_head" ] && [ -z "$_market_origin" ]; then
        _market_bumped=true
    fi

    if [ "$_plugin_bumped" = "false" ] || [ "$_market_bumped" = "false" ]; then
        # Hard-coded literal reason — safe to use deny() directly (no config-derived content).
        deny "prepublish-guard: distributed assets (agents/|skills/|hooks/) changed but the plugin version was not bumped. Bump \\\"version\\\" in BOTH .claude-plugin/plugin.json AND .claude-plugin/marketplace.json (matched semver) in this push, or the marketplace serves nothing (CLAUDE.md §6.3). Push blocked."
    fi

    # -----------------------------------------------------------------------
    # Check 1 passed. Bump-floor sub-stage.
    #
    # The deny path above calls deny() which exits before reaching here.
    # This sub-stage ONLY runs on the pass path.
    # UNDER-BUMP: advisory WARN to stderr; push not blocked.
    # OVER-BUMP: hard-deny unless a valid bump-override token is present.
    # Fail-open: any parse fault or unknown version → skip, one-line note.
    # -----------------------------------------------------------------------

    # Derive the mechanical floor from name-status over shipped paths.
    _floor_saw_added=false
    _floor_saw_removed_or_renamed=false
    _floor_saw_modified=false

    while IFS=$'\t' read -r _fs_status _fs_path_a _fs_path_b || [ -n "$_fs_status" ]; do
        # For rename lines (R<score>TABoldTABnew), the destination is _fs_path_b.
        # For all other lines, the path is _fs_path_a.
        if [ -n "$_fs_path_b" ]; then
            _fs_path="$_fs_path_b"
        else
            _fs_path="$_fs_path_a"
        fi
        # Only act on shipped paths.
        printf '%s' "$_fs_path" | grep -qE '^(agents|skills|hooks)/' 2>/dev/null || continue
        # Inspect the first character of the status field.
        case "${_fs_status%"${_fs_status#?}"}" in
            A) _floor_saw_added=true ;;
            D) _floor_saw_removed_or_renamed=true ;;
            R) _floor_saw_removed_or_renamed=true ;;
            *) _floor_saw_modified=true ;;
        esac
    done <<EOF
$_changed
EOF

    if [ "$_floor_saw_removed_or_renamed" = "true" ]; then
        _floor="major"
    elif [ "$_floor_saw_added" = "true" ]; then
        _floor="minor"
    elif [ "$_floor_saw_modified" = "true" ]; then
        _floor="patch"
    else
        _floor="none"
    fi

    # Compute the actual SemVer delta from the already-read canonical versions.
    _actual=$(semver_delta "$_plugin_origin" "$_plugin_head" 2>/dev/null) || _actual="unknown"
    : "${_actual:=unknown}"

    # Fail-open: unparseable version → skip the floor compare.
    if [ "$_actual" = "unknown" ]; then
        printf 'prepublish-guard: version not X.Y.Z (old=%s new=%s); skipping bump-floor check\n' \
            "$_plugin_origin" "$_plugin_head" >&2
        nodecision
    fi

    # Map level names to numeric ranks for comparison.
    _rank_of() {
        case "$1" in
            none)  printf '0' ;;
            patch) printf '1' ;;
            minor) printf '2' ;;
            major) printf '3' ;;
            *)     printf '-1' ;;
        esac
    }

    _rank_actual=$(_rank_of "$_actual")
    _rank_floor=$(_rank_of "$_floor")

    if [ "$_rank_actual" -lt "$_rank_floor" ] 2>/dev/null; then
        # UNDER-BUMP: actual level is below the mechanical floor.
        if [ "$_floor" = "major" ]; then
            printf 'prepublish-guard: WARN — a shipped asset was DELETED or RENAMED (removed public surface) but the version bump is %s. SemVer suggests MAJOR. If the deleted/renamed file is not a public invocable surface (e.g. an internal include), ignore. (advisory; push not blocked)\n' \
                "$_actual" >&2
        elif [ "$_floor" = "minor" ]; then
            printf 'prepublish-guard: WARN — a NEW shipped file was added (new invocable surface) but the version bump is %s. SemVer suggests MINOR. If the new file is not a new invocable surface (e.g. a _shared include), ignore. (advisory; push not blocked)\n' \
                "$_actual" >&2
        fi
        # floor==patch with actual==none cannot occur here: Check 1 already denied
        # "shipped touched + no version change", so on the pass path a shipped-touch
        # always has actual >= patch. Guard is implicit — fall through to nodecision.
    fi
    if [ "$_rank_actual" -gt "$_rank_floor" ] 2>/dev/null; then
        # OVER-BUMP: applied bump level EXCEEDS the mechanical floor.
        # Deny unless a valid bump-override token is present in the push context.
        #
        # Token format (single-line): bump-override: minor — <reason>
        # Source: last commit-trailer ($GIT_COMMIT_MSG env var) or GIT_PUSH_OPTION_* variables.
        # SEC-DR-A control-char guard: reject any value containing control chars (never eval).

        _override_found=false
        _override_src=""

        # Attempt 1: read from GIT_COMMIT_MSG environment variable (commit trailer).
        if [ -n "${GIT_COMMIT_MSG:-}" ]; then
            _override_src="$GIT_COMMIT_MSG"
        fi

        # Attempt 2: read from GIT_PUSH_OPTION_COUNT / GIT_PUSH_OPTION_N (push options).
        if [ "${GIT_PUSH_OPTION_COUNT:-0}" -gt 0 ] 2>/dev/null; then
            _i=0
            while [ "$_i" -lt "${GIT_PUSH_OPTION_COUNT:-0}" ] 2>/dev/null; do
                _opt_var="GIT_PUSH_OPTION_${_i}"
                _opt_val="${!_opt_var:-}" 2>/dev/null || _opt_val=""
                if [ -n "$_opt_val" ]; then
                    _override_src="${_override_src}
${_opt_val}"
                fi
                _i=$(( _i + 1 ))
            done
        fi

        if [ -n "$_override_src" ]; then
            # SEC-DR-A: reject control chars in the override source before any processing.
            if printf '%s' "$_override_src" | grep -qP '[[:cntrl:]]' 2>/dev/null \
                || printf '%s' "$_override_src" | LC_ALL=C grep -q $'[\x00-\x1f\x7f]' 2>/dev/null; then
                printf 'prepublish-guard: bump-override source contains control characters; treating as absent (SEC-DR-A). Over-bump check proceeds.\n' >&2
            else
                # Match the canonical token pattern on any line of the source.
                if printf '%s' "$_override_src" | grep -qE '^bump-override: (minor|major) — .+$' 2>/dev/null; then
                    _override_found=true
                fi
            fi
        fi

        if [ "$_override_found" = "true" ]; then
            # Valid override token present — suppress the over-bump deny.
            printf 'prepublish-guard: over-bump allowed by bump-override token (actual=%s floor=%s)\n' \
                "$_actual" "$_floor" >&2
            nodecision
        fi

        # No valid override: hard-deny the over-bump.
        # Reason is hardcoded prose; the only interpolated values are the bounded SemVer-level
        # enums ${_floor}/${_actual} (each ∈ {major,minor,patch,none}) — no untrusted or
        # config-derived content reaches the reason string (SDR-PPG-01; CWE-209-safe).
        deny "prepublish-guard: version bump level exceeds the mechanical SemVer floor for this diff. The changed shipped paths (agents/|skills/|hooks/) only warrant a ${_floor} bump, but a ${_actual} was applied. If this over-bump is intentional (e.g. a fix + new surface in the same PR), add a commit trailer or push option: bump-override: ${_actual} — <reason>. See CLAUDE.md §6.3 and agents/delivery.md Step 9. Push blocked."
    fi

    # All other cases: actual >= floor and actual <= floor → silent (correct).
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 6 — Check 2: tests-not-broken guard (runs on gh pr create only)
# ---------------------------------------------------------------------------

if [ "$_is_gh_pr_create" = "true" ]; then

    _CONFIG="${HOME}/.claude/.team-harness.json"
    _check_cmd=""

    # Read prepublish_check from ~/.claude/.team-harness.json.
    # Fail-open completeness: unparseable config, missing key, or empty value
    # all result in _check_cmd="" → treat as undeclared → nodecision.
    if [ -f "$_CONFIG" ]; then
        if command -v jq >/dev/null 2>&1; then
            _check_cmd=$(jq -r '.prepublish_check // empty' "$_CONFIG" 2>/dev/null) || _check_cmd=""
        else
            _check_cmd=$(grep -o '"prepublish_check"[[:space:]]*:[[:space:]]*"[^"]*"' "$_CONFIG" 2>/dev/null \
                | head -1 \
                | sed 's/.*"prepublish_check"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
        fi
    fi

    # Undeclared or empty → no-op.
    if [ -z "$_check_cmd" ]; then
        nodecision
    fi

    # SEC-DR-A control-char guard: reject values containing any control character.
    # A rejected value is treated as undeclared (fail-open, never exec, never block).
    if printf '%s' "$_check_cmd" | grep -qP '[[:cntrl:]]' 2>/dev/null \
        || printf '%s' "$_check_cmd" | LC_ALL=C grep -q $'[\x00-\x1f\x7f]' 2>/dev/null; then
        printf 'prepublish-guard: prepublish_check value contains control characters; treating as undeclared (SEC-DR-A)\n' >&2
        nodecision
    fi

    # Locate a timeout binary. If neither timeout nor gtimeout is present,
    # skip Check 2 entirely — never run an unbounded command (AC-15 / SDR-PPG-02).
    _timeout_bin=""
    if command -v timeout >/dev/null 2>&1; then
        _timeout_bin="timeout"
    elif command -v gtimeout >/dev/null 2>&1; then
        _timeout_bin="gtimeout"
    fi

    if [ -z "$_timeout_bin" ]; then
        printf 'prepublish-guard: timeout/gtimeout binary not found; skipping prepublish_check (no unbounded exec)\n' >&2
        nodecision
    fi

    # Execute the declared command under the internal 90s budget.
    # DO NOT use set -e here (AC-6 / SEC-PPG-4): a non-zero exit is a BLOCK
    # decision, not a script crash. Capture exit code explicitly.
    _rc=0
    _captured_output=""
    set +e
    _captured_output=$("$_timeout_bin" 90s bash -lc "$_check_cmd" 2>&1)
    _rc=$?
    set -e

    if [ $_rc -eq 0 ]; then
        # Tests passed → no-op.
        nodecision
    fi

    # Internal-timeout (124) or command-not-found (127) → guard fault → fail-open.
    if [ $_rc -eq 124 ] || [ $_rc -eq 127 ]; then
        printf 'prepublish-guard: prepublish_check guard fault (exit %d); treating as undeclared (fail-open)\n' "$_rc" >&2
        nodecision
    fi

    # Non-zero exit (other than 124/127) → BLOCK.
    # The deny reason embeds the command JSON-escaped via python3 json.dumps
    # (SDR-PPG-01 / AC-14). Never raw printf '%s' for config-derived content.
    # Captured test stdout/stderr is NEVER placed in the reason (CWE-209 / AC-17).
    # The captured output may go to stderr for the operator's terminal only.

    if [ -n "$_captured_output" ]; then
        printf 'prepublish-guard: prepublish_check output (not included in reason):\n%s\n' "$_captured_output" >&2
    fi

    if command -v python3 >/dev/null 2>&1; then
        # python3 path: JSON-escape the command via json.dumps (SDR-PPG-01).
        _deny_json=$(python3 -c "
import json, sys
rc = sys.argv[1]
cmd = sys.argv[2]
escaped_cmd = json.dumps(cmd)[1:-1]  # strip outer quotes; keeps inner escaping
reason = (
    'prepublish-guard: the declared prepublish_check failed (exit ' + rc + '). '
    'Command: ' + escaped_cmd + '. '
    'Fix the failing tests before opening the PR, or clear the prepublish_check key to bypass. '
    'PR creation blocked.'
)
# Emit the full hookSpecificOutput JSON with the reason embedded
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'permissionDecision': 'deny',
        'permissionDecisionReason': reason,
    }
}))
" "$_rc" "$_check_cmd" 2>/dev/null) || _deny_json=""

        if [ -n "$_deny_json" ]; then
            printf '%s\n' "$_deny_json"
            exit 0
        fi
        # Fall through to bash-degraded deny on python3 output failure.
    fi

    # Bash-degraded path (no python3, or python3 output failure):
    # Omit the command from the reason to avoid unescaped interpolation (SDR-PPG-01).
    deny "prepublish-guard: the declared prepublish_check failed. Fix the failing tests before opening the PR, or clear the prepublish_check key in ~/.claude/.team-harness.json to bypass. PR creation blocked."
fi

# ---------------------------------------------------------------------------
# Final fallthrough nodecision
# ---------------------------------------------------------------------------
nodecision
