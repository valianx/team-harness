#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const forbidden = [
  "policy-block",
  "dev-guard",
  "gcp-guard",
  "gate-guard",
  "checkpoint-guard",
  "prepublish-guard",
  "worktree-guard",
];
const retained = [
  "language-user-prompt",
  "session-start",
  "subagent-start",
  "notify-stage",
  "subagent-trace",
  "precompact-snapshot",
];

const claudeManifest = JSON.parse(await readFile(join(root, ".claude-plugin/hooks.json"), "utf8"));
const commands = Object.values(claudeManifest.hooks)
  .flat()
  .flatMap(entry => entry.hooks ?? [])
  .map(entry => entry.command);
for (const name of forbidden) {
  assert.equal(commands.some(command => command.includes(name)), false, `retired hook remains registered: ${name}`);
}
for (const name of retained) {
  assert.equal(commands.some(command => command.includes(name)), true, `retained hook is missing: ${name}`);
}
assert.deepEqual(
  commands.filter(command => command.includes("run-ts-hook.sh"))
    .map(command => command.split(" ").at(-1))
    .sort(),
  ["language-user-prompt", "notify-stage", "precompact-snapshot", "session-start", "subagent-trace"],
  "only context/observability hooks use the launcher",
);

for (const path of [
  "plugins/team-harness/hooks/hooks.json",
  "plugins/team-harness/hooks/run-codex-hook.sh",
  "tools/codex-runtime/sync-hooks.mjs",
]) {
  await assert.rejects(access(join(root, path)), { code: "ENOENT" }, `${path} still exists`);
}

const pluginSource = await readFile(join(root, "hooks/ts/opencode-plugin.ts"), "utf8");
assert.match(pluginSource, /sessionEnforcementPlugin/);
for (const name of forbidden) assert.doesNotMatch(pluginSource, new RegExp(name));

const packageJson = JSON.parse(await readFile(join(root, "hooks/ts/package.json"), "utf8"));
for (const script of Object.keys(packageJson.scripts)) {
  for (const name of forbidden) assert.equal(script.includes(name), false, `retired build remains: ${script}`);
}

process.stdout.write("hook registration: PASS\n");
