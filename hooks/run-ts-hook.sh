#!/bin/bash
# hooks/run-ts-hook.sh — fail-closed launcher for the compiled TS hook gates.
#
# Invoked ONLY by the plugin wiring (.claude-plugin/hooks.json), never by the
# installer. Carries no gate logic of its own — every decision (allow/ask/deny
# and additionalContext text) comes from the compiled hooks/ts/dist/<name>.cjs
# bundle. This script's only job is to run that bundle under node and to
# define what happens when node or the bundle is missing.
#
# Usage: run-ts-hook.sh <hook-name>
#   e.g. bash run-ts-hook.sh policy-block
#
# Contract (F5 — three classes, per issue #446 cutover plan):
#   1. deny-floors (policy-block, dev-guard, gcp-guard, prepublish-guard,
#      checkpoint-guard, gate-guard): node or the .cjs missing -> emit the explicit deny
#      envelope and block. Never pass-through. This also covers a .cjs that
#      is PRESENT but does not emit a valid decision (empty/truncated
#      artifact, or a node runtime error) — SEC-PR2-001: a present-but-
#      non-functional artifact must deny, never silently pass the tool call
#      through. A legitimate "no decision" (empty stdout, exit 0) still
#      passes through unchanged — the launcher cannot and does not gate on
#      output CONTENT for that case, only on RUNTIME FAILURE signals.
#   2. worktree-guard: advisory/fail-open by contract — node or the .cjs
#      missing -> silent exit 0 (loses only the reminder, never escalates).
#   3. observational (notify-stage, subagent-trace, precompact-snapshot,
#      language-user-prompt, session-start): node or the .cjs missing ->
#      silent exit 0.

HOOK_NAME="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CJS="$ROOT/hooks/ts/dist/${HOOK_NAME}.cjs"

case "$HOOK_NAME" in
  policy-block|dev-guard|gcp-guard|prepublish-guard|checkpoint-guard|gate-guard)
    CLASS="deny-floor"
    ;;
  worktree-guard)
    CLASS="advisory"
    ;;
  *)
    CLASS="observational"
    ;;
esac

deny() {
  local reason="$1"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by team-harness policy: %s. Install Node.js or reinstall the plugin to restore this gate."}}\n' "$reason"
  exit 0
}

if ! command -v node >/dev/null 2>&1; then
  if [ "$CLASS" = "deny-floor" ]; then
    deny "node runtime missing"
  fi
  exit 0
fi

if [ ! -f "$CJS" ]; then
  if [ "$CLASS" = "deny-floor" ]; then
    deny "hook artifact missing"
  fi
  exit 0
fi

# worktree-guard and observational hooks are fail-open by contract: a node
# runtime failure must not propagate a non-zero exit (that would look like a
# tool-call block). Capture output instead of exec-replacing the shell, so a
# crash here is swallowed rather than surfaced.
if [ "$CLASS" != "deny-floor" ]; then
  OUTPUT="$(node "$CJS" 2>/dev/null)" || exit 0
  [ -n "$OUTPUT" ] && printf '%s\n' "$OUTPUT"
  exit 0
fi

# Deny-floors only, from here on (SEC-PR2-001).
#
# A zero-byte/truncated artifact makes node exit 0 with empty stdout — the
# exact same signature as a legitimate "none" decision (the common case: most
# tool calls match nothing and every floor defers). Output inspection alone
# cannot tell those two apart, so the empty-artifact case is rejected BEFORE
# exec, on file size, not on node's output.
if [ ! -s "$CJS" ]; then
  deny "hook artifact empty or unreadable"
fi

# Run under command substitution (not exec) so the launcher can inspect the
# outcome before deciding whether to forward it.
OUTPUT="$(node "$CJS")"
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  deny "hook execution failed"
fi

# A non-empty stdout that isn't a well-formed decision envelope (e.g. a
# partial write, or a node body that printed something other than the
# expected JSON) is corruption, not a legitimate decision — deny. A substring
# grep on "permissionDecision" is not enough: a corrupt artifact could print
# non-JSON text that merely contains the literal string. Parse the envelope
# for real and confirm the decision value is one of the three valid ones.
# "none" is legitimately empty and was already ruled out by the STATUS/size
# checks above, so it is not re-flagged here.
if [ -n "$OUTPUT" ] && ! printf '%s' "$OUTPUT" | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => {
    try {
      const decision = JSON.parse(raw).hookSpecificOutput.permissionDecision;
      process.exit(["allow", "ask", "deny"].includes(decision) ? 0 : 1);
    } catch {
      process.exit(1);
    }
  });
' 2>/dev/null; then
  deny "hook runtime produced no valid decision"
fi

if [ -n "$OUTPUT" ]; then
  printf '%s\n' "$OUTPUT"
fi
exit 0
