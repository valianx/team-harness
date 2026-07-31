#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateMarketplace } from "./validate-marketplace.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "team-harness-codex-marketplace-"));
  const root = join(base, "repo");
  const plugin = join(root, "plugins", "team-harness");
  await mkdir(join(root, ".agents", "plugins"), { recursive: true });
  await mkdir(join(plugin, ".codex-plugin"), { recursive: true });
  await writeFile(join(root, ".agents/plugins/marketplace.json"), JSON.stringify({
    name: "team-harness",
    interface: { displayName: "Team Harness" },
    plugins: [{
      name: "team-harness",
      source: { source: "local", path: "./plugins/team-harness" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Developer Tools",
    }],
  }));
  await writeFile(join(plugin, ".codex-plugin/plugin.json"), JSON.stringify({ name: "team-harness", version: "3.5.0" }));
  return { base, root, plugin, catalogPath: join(root, ".agents/plugins/marketplace.json") };
}

async function expectFailure(action, expected) {
  try {
    await action();
  } catch (error) {
    assert(String(error.message).includes(expected), `expected ${JSON.stringify(expected)}, got ${error.message}`);
    return;
  }
  throw new Error(`expected validator failure containing ${JSON.stringify(expected)}`);
}

async function main() {
  let f = await fixture();
  try {
    await validateMarketplace(f);
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }

  f = await fixture();
  try {
    const outside = join(f.base, "outside");
    await mkdir(outside, { recursive: true });
    await rm(f.plugin, { recursive: true, force: true });
    await symlink(outside, f.plugin, "dir");
    await expectFailure(() => validateMarketplace(f), "symbolic link");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }

  f = await fixture();
  try {
    const outside = join(f.base, "outside-skill.md");
    await writeFile(outside, "untrusted external skill\n");
    const skillPath = join(f.plugin, "skills", "pipeline", "SKILL.md");
    await mkdir(join(f.plugin, "skills", "pipeline"), { recursive: true });
    await symlink(outside, skillPath, "file");
    await expectFailure(() => validateMarketplace(f), "symbolic link");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }

  f = await fixture();
  try {
    const outside = join(f.base, "outside");
    await mkdir(outside, { recursive: true });
    const escaped = join(f.root, "plugins", "escaped");
    await symlink(outside, escaped, "dir");
    const catalog = JSON.parse(await readFile(f.catalogPath, "utf8"));
    catalog.plugins[0].source.path = "./plugins/escaped";
    await writeFile(f.catalogPath, JSON.stringify(catalog));
    await expectFailure(() => validateMarketplace(f), "symbolic link");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }

  f = await fixture();
  try {
    const catalog = JSON.parse(await readFile(f.catalogPath, "utf8"));
    catalog.plugins[0].source.path = "../outside";
    await writeFile(f.catalogPath, JSON.stringify(catalog));
    await expectFailure(() => validateMarketplace(f), "strict repository-local descendant");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }

  f = await fixture();
  try {
    await writeFile(join(f.plugin, ".codex-plugin/plugin.json"), JSON.stringify({ name: "team-harness", version: "03.5.0" }));
    await expectFailure(() => validateMarketplace(f), "strict Semantic Version");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
  process.stdout.write("codex marketplace validator tests: PASS\n");
}

main().catch(error => {
  process.stderr.write(`codex marketplace validator tests: FAIL: ${error.message}\n`);
  process.exitCode = 1;
});
