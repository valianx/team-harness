#!/bin/bash
# POSIX launcher for the first Codex beta. hooks.json intentionally has no
# commandWindows: Windows stays unsupported until a native launcher is tested.
set -u

HOOK_NAME="${1:-}"
EVENT="${2:-PreToolUse}"
HOOK_ROOT="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
ARTIFACT="$HOOK_ROOT/dist/$HOOK_NAME.cjs"

case "$EVENT" in
  PreToolUse|PermissionRequest) ;;
  *) EVENT="PreToolUse" ;;
esac

case "$HOOK_NAME" in
  policy-block|dev-guard|gcp-guard|prepublish-guard|gate-guard) CLASS="deny-floor" ;;
  worktree-guard) CLASS="advisory" ;;
  *) CLASS="unknown" ;;
esac

# These reasons are closed constants. Keeping this encoder shell-only lets a
# deny-floor fail closed even when Node itself is missing, without reflecting
# stdin, paths, commands, or child-process output into the response.
deny_adapter_failure() {
  case "$1" in
    node-missing) reason="node runtime missing" ;;
    artifact-missing) reason="hook artifact missing or empty" ;;
    invalid-input) reason="invalid hook input" ;;
    execution-failed) reason="hook execution failed" ;;
    invalid-output) reason="hook produced invalid JSON" ;;
    invalid-decision) reason="hook produced an invalid decision" ;;
    *) reason="hook adapter failure" ;;
  esac
  if [ "$EVENT" = "PermissionRequest" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Blocked by team-harness Codex hook adapter: %s"}}}\n' "$reason"
  else
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by team-harness Codex hook adapter: %s"}}\n' "$reason"
  fi
  exit 0
}

[ "$CLASS" = "unknown" ] && exit 0
if ! command -v node >/dev/null 2>&1; then
  [ "$CLASS" = "deny-floor" ] && deny_adapter_failure node-missing
  exit 0
fi
if [ ! -s "$ARTIFACT" ]; then
  [ "$CLASS" = "deny-floor" ] && deny_adapter_failure artifact-missing
  exit 0
fi

# Parse every payload before invoking a bundle. policy-block's Write model is
# the only translation needed for Codex's apply_patch input shape.
INPUT="$(node -e '
  let raw="";
  process.stdin.on("data", c => raw += c);
  process.stdin.on("end", () => {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      if (process.argv[1] === "policy-block" && value.tool_name === "apply_patch") {
        value.tool_name = "Write";
        value.tool_input = {
          file_path: "(apply_patch)",
          content: typeof value.tool_input?.command === "string" ? value.tool_input.command : ""
        };
      }
      process.stdout.write(JSON.stringify(value));
    } catch { process.exitCode = 1; }
  });
' "$HOOK_NAME")" || {
  [ "$CLASS" = "deny-floor" ] && deny_adapter_failure invalid-input
  exit 0
}

# Mark the Codex adapter explicitly. The dev-guard reader uses this marker to
# isolate Codex from Claude's persisted ~/.claude autogate state, while the
# policy-block entry uses it to keep SEC-07 validation failures as native
# denies (Codex cannot represent PreToolUse `ask`).
OUTPUT="$(printf '%s' "$INPUT" | TEAM_HARNESS_CODEX_HOOK=1 node "$ARTIFACT" 2>/dev/null)"
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  [ "$CLASS" = "deny-floor" ] && deny_adapter_failure execution-failed
  exit 0
fi
[ -z "$OUTPUT" ] && exit 0

DECISION="$(printf '%s' "$OUTPUT" | node -e '
  let raw="";
  process.stdin.on("data", c => raw += c);
  process.stdin.on("end", () => {
    try {
      const parsed = JSON.parse(raw);
      const decision = parsed?.hookSpecificOutput?.permissionDecision;
      if (typeof decision !== "string") throw new Error();
      process.stdout.write(decision);
    } catch { process.exitCode = 1; }
  });
' 2>/dev/null)" || {
  [ "$CLASS" = "deny-floor" ] && deny_adapter_failure invalid-output
  exit 0
}

case "$EVENT:$DECISION" in
  PreToolUse:deny)
    # Deterministic deny floors remain before execution. Concurrent matching
    # hooks cannot make ordering guarantees, so every floor stands alone.
    printf '%s\n' "$OUTPUT"
    ;;
  PreToolUse:ask)
    # Codex does not support PreToolUse ask: returning it is an error and Codex
    # continues. Supply bounded, non-input-reflecting context instead; the
    # native permission flow remains authoritative for the approval itself.
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"Team Harness classified this action as approval-required. Use the native Codex permission prompt; this hook output is not approval."}}'
    ;;
  PreToolUse:allow)
    # A classifier allow must not bypass Codex sandbox/permission policy.
    # If Codex asks for PermissionRequest, the adapter still declines any
    # classifier allow unless a future explicit Codex-scoped authorization
    # exists.
    ;;
  PermissionRequest:ask)
    # No decision means "decline to decide" and preserves the live prompt.
    ;;
  PermissionRequest:allow)
    # A classifier allow is never a live operator authorization. Even a
    # closed-positive dev-guard case (for example a non-default git push)
    # must leave the native Codex PermissionRequest prompt authoritative.
    # There is no explicit Codex-scoped, action-bound authorization channel in
    # this beta, so emit no decision instead of auto-approving an outward write.
    ;;
  PermissionRequest:deny)
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Blocked by deterministic Team Harness policy."}}}'
    ;;
  *)
    [ "$CLASS" = "deny-floor" ] && deny_adapter_failure invalid-decision
    ;;
esac
