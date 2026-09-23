#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { syncClaudePackageAssets } from "../tools/codex-runtime/sync-skills.mjs";

const rootDir = await mkdtemp(join(tmpdir(), "th-package-assets-"));
const shipped = ["ts/dist/session-start.cjs", "ts/entry/session-start.cc.ts"];
const scratch = ["ts/dist/opencode-plugin.cjs", "ts/dist/session-enforcement.opencode.cjs"];

async function assertCheckReportsEach(rootDir, relativePaths) {
  const writes = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    await assert.rejects(syncClaudePackageAssets({ rootDir, check: true }), /assets are stale/);
  } finally {
    process.stderr.write = originalWrite;
  }
  const output = writes.join("");
  for (const relativePath of relativePaths) {
    const platformPath = relativePath.split("/").join(sep);
    assert.equal(
      output.includes(`plugins${sep}team-harness${sep}${platformPath}`),
      true,
      `check mode must report the specific stale asset: ${relativePath}`,
    );
  }
}

try {
  for (const directory of [".claude-plugin", "agents", "docs", "hooks/ts/dist", "hooks/ts/entry"]) {
    await mkdir(join(rootDir, directory), { recursive: true });
  }
  for (const file of [...shipped, ...scratch]) {
    await writeFile(join(rootDir, "hooks", file), `fixture:${file}\n`);
  }
  await writeFile(join(rootDir, ".claude-plugin", "plugin.json"), "retired plugin fixture\n");
  await writeFile(join(rootDir, ".claude-plugin", "hooks.json"), "active hooks fixture\n");
  await writeFile(join(rootDir, "agents", "retired-agent.md"), "retired agent fixture\n");
  await writeFile(join(rootDir, "docs", "agent-authoring.md"), "retired doc fixture\n");

  await syncClaudePackageAssets({ rootDir, check: false });
  for (const file of shipped) {
    assert.equal(
      await readFile(join(rootDir, "plugins/team-harness/hooks", file), "utf8"),
      await readFile(join(rootDir, "hooks", file), "utf8"),
      `distributed hook must remain synchronized: ${file}`,
    );
  }
  for (const file of scratch) {
    await assert.rejects(access(join(rootDir, "plugins/team-harness/hooks", file)), { code: "ENOENT" });
    assert.equal(await readFile(join(rootDir, "hooks", file), "utf8"), `fixture:${file}\n`);
    await writeFile(join(rootDir, "hooks", file), "new local scratch output\n");
  }
  await syncClaudePackageAssets({ rootDir, check: true });

  // Every generated projection must report and remove a retired owned asset,
  // while unowned files sharing an allowlisted projection root remain intact.
  await rm(join(rootDir, ".claude-plugin", "plugin.json"));
  await rm(join(rootDir, "agents", "retired-agent.md"));
  await rm(join(rootDir, "docs", "agent-authoring.md"));
  const unownedPlugin = join(rootDir, "plugins/team-harness/.claude-plugin/operator.json");
  const unownedDoc = join(rootDir, "plugins/team-harness/docs/operator.md");
  await writeFile(unownedPlugin, "preserve operator plugin file\n");
  await writeFile(unownedDoc, "preserve operator doc file\n");
  const retiredAssets = [
    ".claude-plugin/plugin.json",
    "agents/retired-agent.md",
    "docs/agent-authoring.md",
  ];
  await assertCheckReportsEach(rootDir, retiredAssets);
  for (const relativePath of retiredAssets) {
    assert.equal(
      await access(join(rootDir, "plugins/team-harness", relativePath)).then(() => true, () => false),
      true,
      `check mode must not remove retired generated asset: ${relativePath}`,
    );
  }
  await syncClaudePackageAssets({ rootDir, check: false });
  for (const relativePath of [
    ".claude-plugin/plugin.json",
    "agents/retired-agent.md",
    "docs/agent-authoring.md",
  ]) {
    await assert.rejects(access(join(rootDir, "plugins/team-harness", relativePath)), { code: "ENOENT" });
  }
  assert.equal(await readFile(unownedPlugin, "utf8"), "preserve operator plugin file\n");
  assert.equal(await readFile(unownedDoc, "utf8"), "preserve operator doc file\n");
  await syncClaudePackageAssets({ rootDir, check: true });

  // An unowned link in an allowlisted projection is opaque to the walker and
  // survives both modes without exposing or mutating its external sentinel.
  const unownedLinkTarget = join(rootDir, "external-unowned");
  const unownedLinkSentinel = join(unownedLinkTarget, "sentinel.txt");
  const unownedLink = join(rootDir, "plugins/team-harness/docs/operator-link.md");
  await mkdir(unownedLinkTarget, { recursive: true });
  await writeFile(unownedLinkSentinel, "preserve external sentinel\n");
  await symlink(unownedLinkTarget, unownedLink, process.platform === "win32" ? "junction" : "dir");
  for (const check of [true, false]) {
    await syncClaudePackageAssets({ rootDir, check });
    assert.equal((await lstat(unownedLink)).isSymbolicLink(), true, "unowned link must remain in place");
    assert.equal(await readFile(unownedLinkSentinel, "utf8"), "preserve external sentinel\n");
  }

  // A stale owned agent link is reportable in check mode and write mode removes
  // only the link, leaving the linked target untouched.
  const staleAgentSource = join(rootDir, "agents/retired-agent.md");
  const staleAgentTarget = join(rootDir, "plugins/team-harness/agents/retired-agent.md");
  const staleAgentExternal = join(rootDir, "external-agent");
  const staleAgentSentinel = join(staleAgentExternal, "sentinel.txt");
  await writeFile(staleAgentSource, "owned stale agent\n");
  await syncClaudePackageAssets({ rootDir, check: false });
  await rm(staleAgentSource);
  await rm(staleAgentTarget);
  await mkdir(staleAgentExternal, { recursive: true });
  await writeFile(staleAgentSentinel, "preserve stale-agent target\n");
  await symlink(staleAgentExternal, staleAgentTarget, process.platform === "win32" ? "junction" : "dir");
  await assertCheckReportsEach(rootDir, ["agents/retired-agent.md"]);
  assert.equal((await lstat(staleAgentTarget)).isSymbolicLink(), true, "check mode must retain stale link");
  assert.equal(await readFile(staleAgentSentinel, "utf8"), "preserve stale-agent target\n");
  await syncClaudePackageAssets({ rootDir, check: false });
  await assert.rejects(lstat(staleAgentTarget), { code: "ENOENT" });
  assert.equal(await readFile(staleAgentSentinel, "utf8"), "preserve stale-agent target\n");
  await syncClaudePackageAssets({ rootDir, check: true });

  const leftover = join(rootDir, "plugins/team-harness/hooks/ts/dist/retired-hook.opencode.cjs");
  await writeFile(leftover, "old packaged scratch with no source counterpart\n");
  await assert.rejects(syncClaudePackageAssets({ rootDir, check: true }), /assets are stale/);
  assert.equal(await readFile(leftover, "utf8"), "old packaged scratch with no source counterpart\n");
  await syncClaudePackageAssets({ rootDir, check: false });
  await assert.rejects(access(leftover), { code: "ENOENT" });
  await syncClaudePackageAssets({ rootDir, check: true });

  await rm(join(rootDir, "hooks", shipped[1]));
  const removedCanonicalMirror = join(rootDir, "plugins/team-harness/hooks", shipped[1]);
  assert.equal(await readFile(removedCanonicalMirror, "utf8"), `fixture:${shipped[1]}\n`);
  await assert.rejects(syncClaudePackageAssets({ rootDir, check: true }), /assets are stale/);
  assert.equal(
    await readFile(removedCanonicalMirror, "utf8"),
    `fixture:${shipped[1]}\n`,
    "check mode must not remove a mirror whose canonical source was removed",
  );
  await syncClaudePackageAssets({ rootDir, check: false });
  await assert.rejects(access(removedCanonicalMirror), { code: "ENOENT" });
  assert.equal(
    await readFile(join(rootDir, "plugins/team-harness/hooks", shipped[0]), "utf8"),
    `fixture:${shipped[0]}\n`,
    "active canonical hooks must remain packaged",
  );

  await writeFile(join(rootDir, "hooks", shipped[0]), "changed distributed hook\n");
  await assert.rejects(syncClaudePackageAssets({ rootDir, check: true }), /assets are stale/);
  await syncClaudePackageAssets({ rootDir, check: false });
  await syncClaudePackageAssets({ rootDir, check: true });

  const nestedUnrelated = join(rootDir, "nested-unrelated");
  const nestedTarget = join(rootDir, "plugins/team-harness/hooks/ts/dist");
  const nestedSentinel = join(nestedUnrelated, "session-start.cjs");
  await mkdir(nestedUnrelated, { recursive: true });
  await writeFile(nestedSentinel, "preserve nested unrelated file\n");
  await rm(nestedTarget, { recursive: true });
  await symlink(nestedUnrelated, nestedTarget, process.platform === "win32" ? "junction" : "dir");
  for (const check of [true, false]) {
    await assert.rejects(syncClaudePackageAssets({ rootDir, check }), /symbolic[- ]link/);
    assert.equal(await readFile(nestedSentinel, "utf8"), "preserve nested unrelated file\n");
  }

  const unrelated = join(rootDir, "unrelated");
  const sentinel = join(unrelated, "ts/dist/opencode-plugin.cjs");
  await mkdir(join(unrelated, "ts/dist"), { recursive: true });
  await writeFile(sentinel, "preserve unrelated files\n");
  const hookTarget = join(rootDir, "plugins/team-harness/hooks");
  await rm(hookTarget, { recursive: true });
  await symlink(unrelated, hookTarget, process.platform === "win32" ? "junction" : "dir");
  for (const check of [true, false]) {
    await assert.rejects(syncClaudePackageAssets({ rootDir, check }), /symbolic-link/);
    assert.equal(await readFile(sentinel, "utf8"), "preserve unrelated files\n");
  }
  process.stdout.write("Codex package assets: PASS\n");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
