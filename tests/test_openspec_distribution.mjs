#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownership = JSON.parse(await readFile(path.join(root, "runtime/package-ownership.json"), "utf8"));
const marketplace = JSON.parse(await readFile(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));

async function walk(directory, base = directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute, base));
    else if (entry.isFile()) result.push(path.relative(base, absolute).replaceAll("\\", "/"));
  }
  return result.sort();
}

assert.equal(ownership.schema_version, 1);
assert.deepEqual(Object.keys(ownership.packages).sort(), ["claude", "codex", "go-installer", "opencode"]);
assert.equal(marketplace.plugins.length, 1);
assert.deepEqual(marketplace.plugins[0].source, { source: "github", repo: "valianx/team-harness" });

for (const relative of [
  "plugins/team-harness/.claude-plugin/plugin.json",
  "plugins/team-harness/.claude-plugin/hooks.json",
  "plugins/team-harness/agents/ref-pipeline.md",
  "plugins/team-harness/skills/pipeline/SKILL.md",
  "plugins/team-harness/hooks/run-ts-hook.sh",
]) assert.ok((await readFile(path.join(root, relative))).length > 0, `missing curated Claude asset: ${relative}`);

const forbidden = [
  /^skills\/openspec-[^/]+\//,
  /(?:^|\/)commands\/opsx\//,
  /(?:^|\/)workflows\/opsx\//,
  /^openspec\//,
];
for (const packageRoot of new Set(Object.values(ownership.packages).flat())) {
  const absolute = path.join(root, packageRoot);
  let files;
  try { files = await walk(absolute); } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  for (const relative of files) {
    assert.equal(forbidden.some(pattern => pattern.test(relative)), false, `external OpenSpec adapter crossed package boundary: ${packageRoot}/${relative}`);
  }
}

const embed = await readFile(path.join(root, "assets.go"), "utf8");
assert.match(embed, /\/\/go:embed all:agents skills hooks installer-assets all:\.codex\/agents/);
for (const external of [".agents", ".claude", ".cursor", ".opencode", "openspec"]) {
  assert.equal(embed.includes(`all:${external}`), false, `Go package must not embed ${external}`);
}

process.stdout.write("OpenSpec distribution boundary: PASS\n");
