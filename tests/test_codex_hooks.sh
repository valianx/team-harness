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
  (cd "$ROOT" && bash "$ADAPTER" "$1" < "$FIXTURES/$2")
}

json_value() {
  node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(r);process.stdout.write(String($1 ?? ''))}catch{}})"
}

out="$(run_fixture policy-block pretool-destructive.json)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "catastrophic deletion must be denied"

safe="$(run_fixture policy-block pretool-safe.json)"
[ -z "$safe" ] && pass || fail "safe policy input must be silent"

token_fixture="ghp_$(printf 'A%.0s' {1..36})"
out="$(cd "$ROOT" && printf '%s' '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n+GH_TOKEN='"$token_fixture"'\n*** End Patch"}}' | bash "$ADAPTER" policy-block)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "provider secret in apply_patch must be denied"

# gcp-guard retains its deterministic catastrophic floor. Its ask result is
# deliberately discarded because Codex has no hook-level ask decision.
out="$(cd "$ROOT" && printf '%s' '{"tool_name":"Bash","tool_input":{"command":"gcloud projects delete prod"}}' | bash "$ADAPTER" gcp-guard)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "catastrophic GCP operation must be denied"
out="$(cd "$ROOT" && printf '%s' '{"tool_name":"Bash","tool_input":{"command":"gcloud compute instances create demo"}}' | bash "$ADAPTER" gcp-guard)"
[ -z "$out" ] && pass || fail "unsupported gcp ask must be left to native Codex permissions"

# A stale hook name must not suppress a later registered deny floor when a host
# batches hook names in one launcher invocation.
out="$(cd "$ROOT" && printf '%s' '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | bash "$ADAPTER" unknown-hook policy-block)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "unknown batched hook names must not skip later deny floors"

# Approval-classifying decisions are intentionally left to native Codex
# permissions, but they must not suppress a later deterministic deny floor.
batch_plugin="$(mktemp -d)"
mkdir -p "$batch_plugin/dist"
cp "$ADAPTER" "$batch_plugin/run-codex-hook.sh"
printf '%s\n' 'process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:"ask"}}));' \
  > "$batch_plugin/dist/gcp-guard.cjs"
printf '%s\n' 'process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:"deny"}}));' \
  > "$batch_plugin/dist/gate-guard.cjs"
out="$(printf '%s' '{"tool_name":"Bash","tool_input":{}}' | bash "$batch_plugin/run-codex-hook.sh" gcp-guard gate-guard)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "unsupported ask must not suppress a later deterministic deny"
rm -rf "$batch_plugin"

# Retired approval-classifying hooks are neither callable nor shipped. The
# deny-only gate guard is shipped because it provides the non-waivable
# force-push floor; ordinary approval ownership remains native to Codex.
out="$(run_fixture dev-guard pretool-destructive.json)"
[ -z "$out" ] && pass || fail "retired dev-guard adapter invocation must be silent"
for name in dev-guard prepublish-guard worktree-guard; do
  [ ! -e "$ROOT/plugins/team-harness/hooks/dist/$name.cjs" ] \
    && pass || fail "$name must not ship in the Codex plugin"
done
[ -s "$ROOT/plugins/team-harness/hooks/dist/gate-guard.cjs" ] \
  && pass || fail "deny-only gate-guard must ship in the Codex plugin"

marker='DO_NOT_REFLECT_INPUT_7f3a'
for name in policy-block gcp-guard; do
  out="$(cd "$ROOT" && printf '%s' "{invalid:$marker" | bash "$ADAPTER" "$name")"
  decision="$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')"
  if [ "$decision" = "deny" ] && ! printf '%s' "$out" | grep -q "$marker"; then
    pass
  else
    fail "$name invalid input must fail closed without reflection"
  fi
done

# Launcher failures for an active deny floor stay closed.
tmp_plugin="$(mktemp -d)"
mkdir -p "$tmp_plugin/dist" "$tmp_plugin/bin"
cp "$ADAPTER" "$tmp_plugin/run-codex-hook.sh"
cp "$ROOT/plugins/team-harness/hooks/dist/policy-block.cjs" "$tmp_plugin/dist/policy-block.cjs"
out="$(PATH="$tmp_plugin/bin" /bin/bash "$tmp_plugin/run-codex-hook.sh" policy-block < "$FIXTURES/pretool-safe.json")"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "missing Node must fail closed"
rm "$tmp_plugin/dist/policy-block.cjs"
out="$(bash "$tmp_plugin/run-codex-hook.sh" policy-block < "$FIXTURES/pretool-safe.json")"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "missing active bundle must fail closed"
rm -rf "$tmp_plugin"

if node - "$ROOT/plugins/team-harness/hooks/hooks.json" <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (Object.hasOwn(manifest.hooks, "PermissionRequest")) process.exit(1);
const commands = Object.values(manifest.hooks)
  .flatMap(groups => groups)
  .flatMap(group => group.hooks || [])
  .map(hook => hook.command);
if (commands.length !== 2) process.exit(1);
if (!commands.some(command => command.includes("policy-block"))) process.exit(1);
if (!commands.some(command => command.includes("gcp-guard"))) process.exit(1);
if (!commands.some(command => command.includes("gate-guard"))) process.exit(1);
if (commands.some(command => /dev-guard|prepublish-guard|worktree-guard/.test(command))) process.exit(1);
if (!manifest.description.includes("Native Codex permissions") || !manifest.description.includes("review/trust")) process.exit(1);
NODE
then pass; else fail "manifest must wire only deterministic deny hooks"; fi

# Codex documents PLUGIN_ROOT for plugin hooks, but some supported hosts expose
# only the Claude-compatible alias. Execute the literal manifest command in a
# clean environment so the packaged hook cannot regress to /hooks/... + 127.
manifest_command="$(node - "$ROOT/plugins/team-harness/hooks/hooks.json" <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const commands = manifest.hooks.PreToolUse
  .flatMap(group => group.hooks || [])
  .map(hook => hook.command);
const command = commands.find(value => value.includes("policy-block"));
if (!command) process.exit(1);
process.stdout.write(command);
NODE
)"

gate_manifest_command="$(node - "$ROOT/plugins/team-harness/hooks/hooks.json" <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const command = manifest.hooks.PreToolUse
  .flatMap(group => group.hooks || [])
  .map(hook => hook.command)
  .find(value => value.includes("gate-guard"));
if (!command) process.exit(1);
process.stdout.write(command);
NODE
)"

# Exercise the literal installed Codex hook command after ship, rather than
# only gate-guard's standalone artifact. Every force shape must still deny.
lane_root="$(mktemp -d)"
git -C "$lane_root" init -q
git -C "$lane_root" config user.email "th-test@example.com"
git -C "$lane_root" config user.name "th-test"
git -C "$lane_root" commit -q --allow-empty -m init
git -C "$lane_root" checkout -q -b "feat/codex-force-floor"
mkdir -p "$lane_root/workspaces/x"
printf '%s\n' \
  '- gate3_release: ship' \
  '- working_branch: feat/codex-force-floor' \
  '- worktree: null' \
  '- status: in-progress' > "$lane_root/workspaces/x/00-state.md"
for force_command in \
  'git push -f origin feat/codex-force-floor' \
  'git push --force origin feat/codex-force-floor' \
  'git push --force-with-lease origin feat/codex-force-floor' \
  'git push origin +feat/codex-force-floor:feat/codex-force-floor' \
  'git push --fo\rce origin feat/codex-force-floor' \
  "git push \$'--force' origin feat/codex-force-floor" \
  'bash -c "git push --force origin feat/codex-force-floor"' \
  'eval "git push -f origin feat/codex-force-floor"'; do
  payload="$(node -e 'process.stdout.write(JSON.stringify({tool_name:"Bash",tool_input:{command:process.argv[1]}}))' "$force_command")"
  out="$(cd "$lane_root" && PLUGIN_ROOT="$ROOT/plugins/team-harness" /bin/bash -c "$gate_manifest_command" <<< "$payload")"
  [ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
    && pass || fail "installed gate-guard must deny force push after ship: $force_command"
done
for benign_command in \
  'git push origin feat/codex-force-floor' \
  'gh pr create --title "Codex hook control"'; do
  payload="$(node -e 'process.stdout.write(JSON.stringify({tool_name:"Bash",tool_input:{command:process.argv[1]}}))' "$benign_command")"
  out="$(cd "$lane_root" && PLUGIN_ROOT="$ROOT/plugins/team-harness" /bin/bash -c "$gate_manifest_command" <<< "$payload")"
  [ -z "$out" ] \
    && pass || fail "installed gate-guard must stay silent for shipped benign action: $benign_command"
done
rm -rf "$lane_root"
out="$(
  cd "$ROOT" &&
  env -i PATH=/usr/bin:/bin \
    CLAUDE_PLUGIN_ROOT="$ROOT/plugins/team-harness" \
    /bin/bash -c "$manifest_command" < "$FIXTURES/pretool-destructive.json"
)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "manifest command must launch with CLAUDE_PLUGIN_ROOT only"

out="$(
  cd "$ROOT" &&
  env -i PATH=/usr/bin:/bin \
    PLUGIN_ROOT="$ROOT/plugins/team-harness" \
    CLAUDE_PLUGIN_ROOT=/invalid-plugin-root \
    /bin/bash -c "$manifest_command" < "$FIXTURES/pretool-destructive.json"
)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "manifest command must prefer native PLUGIN_ROOT when available"

stale_root="$(mktemp -d "/tmp/team harness cache.XXXXXX")"
stale_cache="$stale_root/plugins/cache/team-harness/team-harness"
mkdir -p "$stale_cache/3.6.3/.codex-plugin"
cp -R "$ROOT/plugins/team-harness/hooks" "$stale_cache/3.6.3/hooks"
printf '%s\n' '{"name":"team-harness","version":"3.6.3"}' > "$stale_cache/3.6.3/.codex-plugin/plugin.json"
out="$(
  cd "$ROOT" &&
  env -i PATH=/usr/bin:/bin \
    CLAUDE_PLUGIN_ROOT="$stale_cache/3.6.2" \
    /bin/bash -c "$manifest_command" < "$FIXTURES/pretool-destructive.json"
)"
[ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && pass || fail "manifest command must recover from a replaced versioned plugin root"
rm -rf "$stale_root"

assert_invalid_plugin_root() {
  root_value="$1"
  label="$2"
  out="$(
    cd "$ROOT" &&
    env -i PATH=/usr/bin:/bin \
      PLUGIN_ROOT="$root_value" \
      /bin/bash -c "$manifest_command" < "$FIXTURES/pretool-safe.json"
  )"
  if [ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
    && printf '%s' "$out" | grep -q 'plugin runtime missing'; then
    pass
  else
    fail "$label must fail closed without executing a fallback"
  fi
}

assert_invalid_plugin_root "relative/plugin" "relative plugin root"
assert_invalid_plugin_root "/" "filesystem root"

foreign_root="$(mktemp -d)"
mkdir -p "$foreign_root/attacker/hooks"
printf '%s\n' '#!/bin/sh' 'printf "%s\\n" "foreign-runner-executed"' > "$foreign_root/attacker/hooks/run-codex-hook.sh"
chmod +x "$foreign_root/attacker/hooks/run-codex-hook.sh"
assert_invalid_plugin_root "$foreign_root/stale" "foreign sibling root"
rm -rf "$foreign_root"

unsafe_root="$(mktemp -d)"
unsafe_cache="$unsafe_root/plugins/cache/team-harness/team-harness"
mkdir -p "$unsafe_cache/9.9.9/hooks" "$unsafe_cache/9.9.9/.codex-plugin"
printf '%s\n' '#!/bin/sh' 'printf "%s\\n" "unsafe-runner-executed"' > "$unsafe_root/runner.sh"
chmod +x "$unsafe_root/runner.sh"
ln -s "$unsafe_root/runner.sh" "$unsafe_cache/9.9.9/hooks/run-codex-hook.sh"
printf '%s\n' '{"name":"team-harness","version":"9.9.9"}' > "$unsafe_cache/9.9.9/.codex-plugin/plugin.json"
assert_invalid_plugin_root "$unsafe_cache/8.8.8" "symlink fallback runner"
rm -rf "$unsafe_root"

nonregular_root="$(mktemp -d)"
nonregular_cache="$nonregular_root/plugins/cache/team-harness/team-harness"
mkdir -p "$nonregular_cache/9.9.9/hooks/run-codex-hook.sh" \
  "$nonregular_cache/9.9.9/.codex-plugin"
printf '%s\n' '{"name":"team-harness","version":"9.9.9"}' \
  > "$nonregular_cache/9.9.9/.codex-plugin/plugin.json"
assert_invalid_plugin_root "$nonregular_cache/8.8.8" "non-regular fallback runner"
rm -rf "$nonregular_root"

wrong_manifest_root="$(mktemp -d)"
wrong_manifest_cache="$wrong_manifest_root/plugins/cache/team-harness/team-harness"
mkdir -p "$wrong_manifest_cache/9.9.9/hooks" \
  "$wrong_manifest_cache/9.9.9/.codex-plugin"
printf '%s\n' '#!/bin/sh' 'printf "%s\\n" "wrong-manifest-runner-executed"' \
  > "$wrong_manifest_cache/9.9.9/hooks/run-codex-hook.sh"
chmod +x "$wrong_manifest_cache/9.9.9/hooks/run-codex-hook.sh"
printf '%s\n' '{"name":"not-team-harness","version":"8.8.8"}' \
  > "$wrong_manifest_cache/9.9.9/.codex-plugin/plugin.json"
assert_invalid_plugin_root "$wrong_manifest_cache/8.8.8" "invalid fallback manifest"
rm -rf "$wrong_manifest_root"

out="$(
  cd "$ROOT" &&
  env -i PATH=/usr/bin:/bin \
    /bin/bash -c "$manifest_command" < "$FIXTURES/pretool-safe.json"
)"
if [ "$(printf '%s' "$out" | json_value 'd.hookSpecificOutput?.permissionDecision')" = "deny" ] \
  && printf '%s' "$out" | grep -q 'plugin runtime missing'; then
  pass
else
  fail "missing plugin-root aliases must fail closed without hook exit 127"
fi

if node "$ROOT/tools/codex-runtime/sync-hooks.mjs" --check >/dev/null; then
  pass
else
  fail "Codex hook bundles are stale"
fi

sync_fixture="$(mktemp -d)"
mkdir -p "$sync_fixture/hooks/ts/dist" "$sync_fixture/plugins/team-harness/hooks/dist"
if node - "$ROOT" "$sync_fixture" <<'NODE'
import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sync } from "./tools/codex-runtime/sync-hooks.mjs";

const root = process.argv[3];
const names = ["policy-block", "gcp-guard", "gate-guard"];
const source = name => join(root, "hooks/ts/dist", `${name}.cjs`);
const target = name => join(root, "plugins/team-harness/hooks/dist", `${name}.cjs`);
for (const name of names) await writeFile(source(name), `source-${name}\n`);
await sync({ rootDir: root });
assert.equal(await readFile(target("policy-block"), "utf8"), "source-policy-block\n");
await writeFile(source("policy-block"), "updated\n");
const stderrWrite = process.stderr.write;
process.stderr.write = () => true;
try {
  await assert.rejects(() => sync({ rootDir: root, check: true }), /stale/);
} finally {
  process.stderr.write = stderrWrite;
}
const outside = join(root, "outside.cjs");
await writeFile(outside, "outside\n");
await rm(target("policy-block"));
await symlink(outside, target("policy-block"));
await assert.rejects(() => sync({ rootDir: root }), /symbolic link target/);
await rm(target("policy-block"));
await mkdir(target("policy-block"));
await assert.rejects(() => sync({ rootDir: root }), /non-regular target/);
NODE
then pass; else fail "sync-hooks target safety must hold for active bundles"; fi
rm -rf "$sync_fixture"

if [ "$FAIL" -ne 0 ]; then
  echo "codex hooks: FAIL ($FAIL failed, $PASS passed)" >&2
  exit 1
fi
echo "codex hooks: PASS ($PASS cases)"
