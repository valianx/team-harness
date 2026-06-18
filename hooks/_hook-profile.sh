#!/bin/bash
# hooks/_hook-profile.sh
# Shared sourced helper — TH_HOOK_PROFILE resolver.
# Source this file in observability/notification hooks that need to check the
# active profile level before producing any output.
#
# Provides:
#   th_hook_profile         — echoes the normalized profile: one of minimal,
#                             standard, strict.  Unset / empty / unrecognized
#                             TH_HOOK_PROFILE → echoes "standard" (fail-safe).
#   th_observability_enabled <class>
#                           — exits 0 (enabled) or 1 (suppressed) for a class
#                             token.  Unknown class → exits 0 (fail-safe: on).
#
# Class tokens:
#   idle-notify             — idle/stage toast notifications (notify-*.sh,
#                             notify-stage.sh)
#   pipeline-observability  — new pipeline observability hooks (subagent-trace.sh,
#                             precompact-snapshot.sh)
#
# Decision matrix:
#   Profile   | idle-notify | pipeline-observability
#   ----------|-------------|------------------------
#   minimal   | suppressed  | suppressed
#   standard  | enabled     | enabled      (default when TH_HOOK_PROFILE unset)
#   strict    | enabled     | enabled
#
# Usage in a gated hook (after sourcing):
#   . "$(dirname "$0")/_hook-profile.sh"
#   th_observability_enabled <class> || exit 0
#
# Fail-safe property: if this file cannot be sourced or TH_HOOK_PROFILE is
# unreadable, the gated hook proceeds as if "standard" — observability is on
# by default, never silently off due to a helper fault.
#
# ENFORCEMENT FLOOR (AC-13): the five enforcement hooks (policy-block.sh,
# dev-guard.sh, gcp-guard.sh, worktree-guard.sh, checkpoint-guard.sh) MUST
# NEVER source this file.  session-start.sh and language-user-prompt.sh MUST
# NEVER source this file.  Only the observability/notification hooks may source
# it.  Suite 117 asserts the absence of _hook-profile.sh in all floor hooks.
#
# Cross-platform: bash + POSIX.  No python3/jq dependency.
# CLAUDE.md §12 (generic, no tokens, no private endpoints).

th_hook_profile() {
    local _p="${TH_HOOK_PROFILE:-}"
    case "$_p" in
        minimal|standard|strict)
            printf '%s' "$_p"
            ;;
        *)
            # Unset, empty, or unrecognized → default: standard (preserves
            # exactly today's behavior for all existing installs).
            printf '%s' "standard"
            ;;
    esac
}

# th_observability_enabled <class>
# Returns 0 (enabled) or 1 (suppressed).
# Unknown class → 0 (fail-safe: assume enabled, never silently suppress).
th_observability_enabled() {
    local _class="${1:-}"
    local _profile
    _profile=$(th_hook_profile)

    case "$_profile" in
        minimal)
            # Both classes suppressed under minimal.
            case "$_class" in
                idle-notify|pipeline-observability)
                    return 1
                    ;;
                *)
                    # Unknown class: fail-safe → enabled.
                    return 0
                    ;;
            esac
            ;;
        standard|strict|*)
            # standard and strict: both classes enabled.
            # Unknown profile falls here too (fail-safe: standard behavior).
            return 0
            ;;
    esac
}
