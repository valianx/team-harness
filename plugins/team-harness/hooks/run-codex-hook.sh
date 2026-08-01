#!/bin/bash
# POSIX launcher for deterministic-deny Codex hooks. Approval-classifying
# hooks are intentionally not registered: native Codex permissions own asks.
set -u

HOOK_NAME="${1:-}"
HOOK_ROOT="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
ARTIFACT="$HOOK_ROOT/dist/$HOOK_NAME.cjs"

case "$HOOK_NAME" in
  policy-block|gcp-guard) ;;
  *) exit 0 ;;
esac

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
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by team-harness Codex hook adapter: %s"}}\n' "$reason"
  exit 0
}

command -v node >/dev/null 2>&1 || deny_adapter_failure node-missing
[ -s "$ARTIFACT" ] || deny_adapter_failure artifact-missing

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
' "$HOOK_NAME")" || deny_adapter_failure invalid-input

OUTPUT="$(printf '%s' "$INPUT" | TEAM_HARNESS_CODEX_HOOK=1 node "$ARTIFACT" 2>/dev/null)"
[ "$?" -eq 0 ] || deny_adapter_failure execution-failed
[ -n "$OUTPUT" ] || exit 0

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
' 2>/dev/null)" || deny_adapter_failure invalid-output

case "$DECISION" in
  deny) printf '%s\n' "$OUTPUT" ;;
  ask|allow) exit 0 ;;
  *) deny_adapter_failure invalid-decision ;;
esac
