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

# Retired approval-classifying hooks are neither callable nor shipped.
out="$(run_fixture dev-guard pretool-destructive.json)"
[ -z "$out" ] && pass || fail "retired dev-guard adapter invocation must be silent"
for name in dev-guard gate-guard prepublish-guard worktree-guard; do
  [ ! -e "$ROOT/plugins/team-harness/hooks/dist/$name.cjs" ] \
    && pass || fail "$name must not ship in the Codex plugin"
done

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
if (commands.some(command => /dev-guard|gate-guard|prepublish-guard|worktree-guard/.test(command))) process.exit(1);
if (!manifest.description.includes("Native Codex permissions") || !manifest.description.includes("review/trust")) process.exit(1);
NODE
then pass; else fail "manifest must wire only deterministic deny hooks"; fi

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
const names = ["policy-block", "gcp-guard"];
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
