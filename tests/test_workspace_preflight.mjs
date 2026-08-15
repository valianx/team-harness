#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const helper = join(repositoryRoot, "skills/pipeline/scripts/workspace-preflight.mjs");

function run(root, workspace) {
  const result = spawnSync(process.execPath, [helper, "--root", root, "--workspace", workspace], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.stderr, "", `unexpected stderr: ${result.stderr}`);
  return { ...result, json: JSON.parse(result.stdout) };
}

const temp = await mkdtemp(join(tmpdir(), "team-harness-workspace-preflight-"));
try {
  const externalRoot = join(temp, "obsidian", "work-logs", "team-harness");
  await mkdir(externalRoot, { recursive: true });
  const workspace = join(externalRoot, "integrate-openspec-design");

  const ready = run(externalRoot, workspace);
  assert.equal(ready.status, 0);
  assert.equal(ready.json.status, "ready");
  assert.equal(ready.json.state_created, false);
  assert.equal(ready.json.root, externalRoot);
  assert.equal(ready.json.workspace, workspace);
  await assert.rejects(() => lstat(workspace), { code: "ENOENT" });
  assert.deepEqual(await readdir(externalRoot), [], "write probe left an artifact behind");

  const outside = run(externalRoot, join(temp, "local-fallback"));
  assert.equal(outside.status, 2);
  assert.equal(outside.json.status, "invalid");
  assert.match(outside.json.message, /strictly below root/);

  const missing = run(join(temp, "missing-root"), workspace);
  assert.equal(missing.status, 2);
  assert.equal(missing.json.status, "invalid");
  assert.equal(missing.json.reason_code, "ENOENT");

  if (process.platform !== "win32") {
    await chmod(externalRoot, 0o500);
    const denied = run(externalRoot, workspace);
    await chmod(externalRoot, 0o700);
    assert.equal(denied.status, 2);
    assert.equal(denied.json.status, "not-writable");
    assert.match(denied.json.reason_code, /EACCES|EPERM|EROFS/);
    assert.equal(denied.json.state_created, false);
  }

  const symlinkLikeLeaf = join(externalRoot, "not-a-directory");
  await writeFile(symlinkLikeLeaf, "data\n");
  const invalidLeaf = run(externalRoot, symlinkLikeLeaf);
  assert.equal(invalidLeaf.status, 2);
  assert.equal(invalidLeaf.json.status, "invalid");
  assert.match(invalidLeaf.json.message, /non-symlink directory/);

  console.log("workspace preflight: PASS");
} finally {
  await rm(temp, { recursive: true, force: true });
}
