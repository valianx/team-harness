#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncClaudePackageAssets } from "../tools/codex-runtime/sync-skills.mjs";

const rootDir = await mkdtemp(join(tmpdir(), "th-package-assets-"));
const shipped = ["ts/dist/gcp-guard.cjs", "ts/entry/session-enforcement.opencode.ts"];
const scratch = ["ts/dist/opencode-plugin.cjs", "ts/dist/session-enforcement.opencode.cjs"];
try {
  for (const directory of [".claude-plugin", "agents", "docs", "hooks/ts/dist", "hooks/ts/entry"]) {
    await mkdir(join(rootDir, directory), { recursive: true });
  }
  for (const file of [...shipped, ...scratch]) {
    await writeFile(join(rootDir, "hooks", file), `fixture:${file}\n`);
  }

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

  const leftover = join(rootDir, "plugins/team-harness/hooks/ts/dist/checkpoint-guard.opencode.cjs");
  await writeFile(leftover, "old packaged scratch with no source counterpart\n");
  await assert.rejects(syncClaudePackageAssets({ rootDir, check: true }), /assets are stale/);
  assert.equal(await readFile(leftover, "utf8"), "old packaged scratch with no source counterpart\n");
  await syncClaudePackageAssets({ rootDir, check: false });
  await assert.rejects(access(leftover), { code: "ENOENT" });
  await syncClaudePackageAssets({ rootDir, check: true });

  await writeFile(join(rootDir, "hooks", shipped[0]), "changed distributed hook\n");
  await assert.rejects(syncClaudePackageAssets({ rootDir, check: true }), /assets are stale/);
  await syncClaudePackageAssets({ rootDir, check: false });
  await syncClaudePackageAssets({ rootDir, check: true });

  const unrelated = join(rootDir, "unrelated");
  const sentinel = join(unrelated, "ts/dist/opencode-plugin.cjs");
  await mkdir(join(unrelated, "ts/dist"), { recursive: true });
  await writeFile(sentinel, "preserve unrelated files\n");
  const hookTarget = join(rootDir, "plugins/team-harness/hooks");
  await rm(hookTarget, { recursive: true });
  await symlink(unrelated, hookTarget, "dir");
  for (const check of [true, false]) {
    await assert.rejects(syncClaudePackageAssets({ rootDir, check }), /symbolic-link/);
    assert.equal(await readFile(sentinel, "utf8"), "preserve unrelated files\n");
  }
  process.stdout.write("Codex package assets: PASS\n");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
