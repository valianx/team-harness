#!/bin/bash
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADAPTER="$ROOT/plugins/team-harness/hooks/run-codex-hook.sh"
FIXTURES="$ROOT/tests/fixtures/codex-hooks"
PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); }
fail() { echo "FAIL: $1" >&2; FAIL=$((FAIL+1)); }

run_fixture() {
  local hook="$1" fixture="$2" event="${3:-PreToolUse}"
  (cd "$ROOT" && bash "$ADAPTER" "$hook" "$event" < "$FIXTURES/$fixture")
}

fixture_json_with_cwd() {
  local fixture="$1" cwd="$2"
  node - "$FIXTURES/$fixture" "$cwd" <<'NODE'
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
payload.cwd = process.argv[3];
process.stdout.write(JSON.stringify(payload));
NODE
}

run_fixture_with_cwd() {
  local hook="$1" fixture="$2" cwd="$3" event="${4:-PreToolUse}"
  fixture_json_with_cwd "$fixture" "$cwd" | (cd "$ROOT" && bash "$ADAPTER" "$hook" "$event")
}

# Expand the compact security seeds at runtime so the repository does not
# carry a megabyte fixture while the exact SEC-07 boundaries remain exercised.
run_expanded_policy_fixture() {
  local fixture="$1" mode="$2"
  node - "$FIXTURES/$fixture" "$mode" <<'NODE' | (cd "$ROOT" && bash "$ADAPTER" policy-block)
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const mode = process.argv[3];
const tokenFixture = "ghp_" + "A".repeat(36);
if (payload.tool_input && payload.tool_input.content === "provider-token-fixture") {
  payload.tool_input.content = tokenFixture;
}
if (mode === "oversized") {
  payload.tool_input.padding = "x".repeat(1_100_000);
}
if (mode === "deep") {
  let nested = { marker: tokenFixture };
  for (let i = 0; i < 80; i += 1) nested = { nested };
  payload.tool_input.nested = nested;
}
process.stdout.write(JSON.stringify(payload));
NODE
}

json_value() {
  local expression="$1"
  node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(r);process.stdout.write(String($expression ?? ''))}catch{}})"
}

out="$(run_fixture policy-block pretool-destructive.json)"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && pass || fail "deterministic destructive command must be denied before execution"

token_fixture="ghp_$(printf 'A%.0s' {1..36})"
out="$(cd "$ROOT" && printf '%s' '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n+GH_TOKEN='"$token_fixture"'\n*** End Patch"}}' | bash "$ADAPTER" policy-block)"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && pass || fail "provider-shaped secret in apply_patch must be denied"

# SEC-07 validation failures must remain a deterministic deny on Codex. The
# adapter cannot represent PreToolUse ask; bounded context would continue the
# destructive/secret-bearing call without a live decision.
out="$(run_expanded_policy_fixture pretool-destructive-oversized.json oversized)"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q 'additionalContext' && pass || fail "oversized destructive payload must remain denied"

out="$(run_expanded_policy_fixture pretool-secret-deep.json deep)"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q 'additionalContext' && pass || fail "deep secret payload must remain denied"

out="$(run_expanded_policy_fixture pretool-secret-schema-invalid.json schema-invalid)"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q 'additionalContext' && pass || fail "schema-rejected secret payload must remain denied"

# PreToolUse ask is unsupported by Codex. The adapter must not emit ask (Codex
# would report an error and continue) and must not turn it into an irreversible
# deny that a later live approval can never release.
out="$(run_fixture dev-guard pretool-outward-approval.json)"
if printf '%s' "$out" | grep -q 'additionalContext' && ! printf '%s' "$out" | grep -q 'permissionDecision'; then
  pass
else
  fail "approval-required PreToolUse must provide bounded context without ask/deny"
fi
if printf '%s' "$out" | grep -q 'gh pr create\|--title test'; then
  fail "approval context must not reflect tool input"
else
  pass
fi

# PermissionRequest ask deliberately returns no decision. Codex therefore
# keeps its normal live prompt; the hook neither auto-approves nor permanently
# denies the outward action.
out="$(run_fixture dev-guard permission-outward-approval.json PermissionRequest)"
[ -z "$out" ] && pass || fail "approval-required PermissionRequest must decline to decide"

# Claude's persisted ~/.claude autogate state must not auto-approve a Codex
# PermissionRequest. The beta requires the native Codex prompt; only a future
# explicit Codex-scoped authorization may add an allow path.
tmp_home="$(mktemp -d)"
mkdir -p "$tmp_home/.claude"
printf '%s\n' '{"autogate":{"pr_create":true}}' > "$tmp_home/.claude/.team-harness.json"
out="$(cd "$ROOT" && HOME="$tmp_home" bash "$ADAPTER" dev-guard PermissionRequest < "$FIXTURES/permission-outward-approval.json")"
[ -z "$out" ] && pass || fail "Claude autogate must not auto-approve Codex PermissionRequest"
out="$(cd "$ROOT" && HOME="$tmp_home" bash "$ADAPTER" dev-guard PreToolUse < "$FIXTURES/pretool-outward-approval.json")"
[ -n "$out" ] && ! printf '%s' "$out" | grep -q 'permissionDecision' && pass || fail "Codex autogate state must not bypass native PreToolUse policy"
rm -rf "$tmp_home"

# A positively-resolved non-default push reaches dev-guard's closed-positive
# classifier allow. That classification is not a live Codex authorization:
# PermissionRequest must still decline to decide, so native Codex keeps the
# operator prompt. Build a hermetic repository with origin/HEAD rather than
# relying on CI's checkout metadata.
nondefault_repo="$(mktemp -d)"
git -C "$nondefault_repo" init -q -b main
git -C "$nondefault_repo" remote add origin "$nondefault_repo/remote.git"
git -C "$nondefault_repo" symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
nondefault_payload="$(fixture_json_with_cwd permission-nondefault-push.json "$nondefault_repo")"
direct="$(cd "$ROOT" && printf '%s' "$nondefault_payload" | TEAM_HARNESS_CODEX_HOOK=1 node plugins/team-harness/hooks/dist/dev-guard.cjs)"
direct_decision="$(printf '%s' "$direct" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$direct_decision" = "allow" ] && pass || fail "non-default git push fixture must reach classifier allow"
out="$(run_fixture_with_cwd dev-guard permission-nondefault-push.json "$nondefault_repo" PermissionRequest)"
[ -z "$out" ] && pass || fail "PermissionRequest classifier allow must not auto-approve non-default git push"
rm -rf "$nondefault_repo"

safe="$(run_fixture policy-block pretool-safe.json)"
[ -z "$safe" ] && pass || fail "safe command must produce no decision"

advisory="$(cd "$ROOT" && printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git checkout -b feat/test"}}' | bash "$ADAPTER" worktree-guard)"
if printf '%s' "$advisory" | grep -q 'additionalContext' && ! printf '%s' "$advisory" | grep -q 'permissionDecision'; then
  pass
else
  fail "worktree advisory must not block"
fi

# Codex launches matching command hooks concurrently. Exercise the full Bash
# group without assuming start/completion order: an independent deterministic
# deny must remain present, and no unsupported ask may escape any launcher.
concurrent_dir="$(mktemp -d)"
concurrent_hooks=(policy-block dev-guard gcp-guard prepublish-guard gate-guard worktree-guard)
for hook in "${concurrent_hooks[@]}"; do
  (run_fixture "$hook" pretool-destructive.json > "$concurrent_dir/$hook.out") &
done
wait
deny_count=0
ask_count=0
for hook in "${concurrent_hooks[@]}"; do
  [ "$(json_value 'd.hookSpecificOutput?.permissionDecision' < "$concurrent_dir/$hook.out")" = "deny" ] && deny_count=$((deny_count+1))
  grep -q '"permissionDecision":"ask"' "$concurrent_dir/$hook.out" && ask_count=$((ask_count+1))
done
if [ "$deny_count" -ge 1 ] && [ "$ask_count" -eq 0 ]; then pass; else fail "concurrent hook group must preserve an independent deny with no ask"; fi
rm -rf "$concurrent_dir"

# Invalid input is rejected before every deny-floor bundle and the generic
# failure response never contains the untrusted stdin bytes.
marker='DO_NOT_REFLECT_INPUT_7f3a'
out="$(cd "$ROOT" && printf '%s' "{invalid:$marker" | bash "$ADAPTER" dev-guard)"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
if [ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q "$marker"; then pass; else fail "invalid input must fail closed without reflection"; fi
out="$(cd "$ROOT" && printf '%s' "{invalid:$marker" | bash "$ADAPTER" dev-guard PermissionRequest)"
behavior="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.decision?.behavior')"
if [ "$behavior" = "deny" ] && ! printf '%s' "$out" | grep -q "$marker"; then pass; else fail "invalid PermissionRequest must fail closed without reflection"; fi

# Failure fixtures use an isolated plugin copy; they never mutate the shipped
# bundle. Matching hooks are concurrent in Codex, so each deny-floor launcher
# is tested as an independent fail-closed unit.
tmp_plugin="$(mktemp -d)"
mkdir -p "$tmp_plugin/dist" "$tmp_plugin/bin"
cp "$ADAPTER" "$tmp_plugin/run-codex-hook.sh"
cp "$ROOT/plugins/team-harness/hooks/dist/dev-guard.cjs" "$tmp_plugin/dist/dev-guard.cjs"

out="$(PATH="$tmp_plugin/bin" /bin/bash "$tmp_plugin/run-codex-hook.sh" dev-guard < "$FIXTURES/pretool-safe.json")"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && pass || fail "missing Node must fail closed"

rm "$tmp_plugin/dist/dev-guard.cjs"
out="$(bash "$tmp_plugin/run-codex-hook.sh" dev-guard < "$FIXTURES/pretool-safe.json")"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && pass || fail "missing bundle must fail closed"

printf '%s\n' 'process.stderr.write("DO_NOT_LEAK_CHILD_STDERR"); process.exit(23);' > "$tmp_plugin/dist/dev-guard.cjs"
out="$(bash "$tmp_plugin/run-codex-hook.sh" dev-guard < "$FIXTURES/pretool-safe.json")"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q 'DO_NOT_LEAK_CHILD_STDERR' && pass || fail "bundle execution failure must fail closed without child stderr"

printf '%s\n' 'process.stdout.write("DO_NOT_LEAK_INVALID_OUTPUT");' > "$tmp_plugin/dist/dev-guard.cjs"
out="$(bash "$tmp_plugin/run-codex-hook.sh" dev-guard < "$FIXTURES/pretool-safe.json")"
decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
[ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q 'DO_NOT_LEAK_INVALID_OUTPUT' && pass || fail "invalid bundle output must fail closed without reflection"
rm -rf "$tmp_plugin"

# Manifest contract: only dev-guard may decide PermissionRequest, POSIX-only is
# explicit, and concurrent handlers are not treated as ordered.
if node - "$ROOT/plugins/team-harness/hooks/hooks.json" <<'NODE'
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const permission = manifest.hooks.PermissionRequest || [];
const handlers = permission.flatMap(group => group.hooks || []);
if (handlers.length !== 1 || !handlers[0].command.includes("dev-guard PermissionRequest")) process.exit(1);
const all = Object.values(manifest.hooks).flatMap(groups => groups).flatMap(group => group.hooks || []);
if (all.some(handler => Object.hasOwn(handler, "commandWindows"))) process.exit(1);
if (!manifest.description.includes("review/trust") || !manifest.description.includes("POSIX-only")) process.exit(1);
NODE
then pass; else fail "manifest PermissionRequest/trust/POSIX contract is invalid"; fi

if node "$ROOT/tools/codex-runtime/sync-hooks.mjs" --check >/dev/null; then
  pass
else
  fail "Codex hook bundles are stale"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "codex hooks: FAIL ($FAIL failed, $PASS passed)" >&2
  exit 1
fi
echo "codex hooks: PASS ($PASS cases)"
