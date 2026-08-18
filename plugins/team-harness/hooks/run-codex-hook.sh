#!/bin/bash
# POSIX launcher for deterministic-deny Codex hooks. Approval-classifying
# hooks are intentionally not registered: native Codex permissions own asks.
set -u

HOOK_ROOT="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
HOOK_NAMES=()

for hook_name in "$@"; do
  case "$hook_name" in
    policy-block|gcp-guard) HOOK_NAMES+=("$hook_name") ;;
    *) ;;
  esac
done

[ "${#HOOK_NAMES[@]}" -gt 0 ] || exit 0

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

INPUT="$(node -e '
  let raw="";
  process.stdin.on("data", c => raw += c);
  process.stdin.on("end", () => {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      process.stdout.write(JSON.stringify(value));
    } catch { process.exitCode = 1; }
  });
')" || deny_adapter_failure invalid-input

for HOOK_NAME in "${HOOK_NAMES[@]}"; do
  ARTIFACT="$HOOK_ROOT/dist/$HOOK_NAME.cjs"
  [ -s "$ARTIFACT" ] || deny_adapter_failure artifact-missing

  HOOK_INPUT="$INPUT"
  if [ "$HOOK_NAME" = "policy-block" ]; then
    HOOK_INPUT="$(printf '%s' "$INPUT" | node -e '
      let raw="";
      process.stdin.on("data", c => raw += c);
      process.stdin.on("end", () => {
        try {
          const value = JSON.parse(raw);
          if (value.tool_name === "apply_patch") {
            value.tool_name = "Write";
            value.tool_input = {
              file_path: "(apply_patch)",
              content: typeof value.tool_input?.command === "string" ? value.tool_input.command : ""
            };
          }
          process.stdout.write(JSON.stringify(value));
        } catch { process.exitCode = 1; }
      });
    ')" || deny_adapter_failure invalid-input
  fi

  OUTPUT="$(printf '%s' "$HOOK_INPUT" | TEAM_HARNESS_CODEX_HOOK=1 node "$ARTIFACT" 2>/dev/null)"
  [ "$?" -eq 0 ] || deny_adapter_failure execution-failed
  [ -n "$OUTPUT" ] || continue

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
    deny) printf '%s\n' "$OUTPUT"; exit 0 ;;
    ask|allow) continue ;;
    *) deny_adapter_failure invalid-decision ;;
  esac
done
