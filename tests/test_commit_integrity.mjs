#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCommitIntegrityResult, runCommitIntegrity } from "../plugins/team-harness/skills/pipeline/scripts/commit-integrity.mjs";

const failures = [];
const helper = fileURLToPath(new URL("../plugins/team-harness/skills/pipeline/scripts/commit-integrity.mjs", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

function git(repository, ...argv) {
  return execFileSync("git", argv, { cwd: repository, encoding: "utf8" }).trim();
}

async function withRepository(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-commit-integrity-"));
  const repository = path.join(root, "repository");
  await mkdir(path.join(repository, "src"), { recursive: true });
  try {
    git(repository, "init", "-q", "-b", "main");
    git(repository, "config", "user.name", "Team Harness Test");
    git(repository, "config", "user.email", "test@example.invalid");
    await writeFile(path.join(repository, "src/base.mjs"), "export const base = true;\n");
    git(repository, "add", "src/base.mjs");
    git(repository, "commit", "-q", "-m", "base");
    const baseSha = git(repository, "rev-parse", "HEAD");
    git(repository, "switch", "-q", "-c", "feature/integrity");
    await writeFile(path.join(repository, "src/task.mjs"), "export const task = true;\n");
    git(repository, "add", "src/task.mjs");
    git(repository, "commit", "-q", "-m", "task");
    const commit = git(repository, "rev-parse", "HEAD");
    const options = {
      repository,
      reported_commit: commit,
      base_sha: baseSha,
      working_branch: "feature/integrity",
      worktree: repository,
      allowed_paths: ["src/task.mjs"],
      scope_drift_paths: [],
    };
    await callback({ root, repository, baseSha, commit, options });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

console.log("=== Deterministic Git commit integrity ===");

await check("passes the six Git-backed conjuncts with fixed bounded evidence", async () => withRepository(async fixture => {
  const result = await runCommitIntegrity(fixture.options);
  assert.equal(isCommitIntegrityResult(result), true);
  assert.equal(result.verdict, "pass");
  assert.equal(result.error_code, null);
  assert.equal(result.head_sha, fixture.commit);
  assert.equal(result.checks.lane_coverage, "external");
  assert.deepEqual(result.counts, { dirty_entries: 0, changed_paths: 1, out_of_scope_paths: 0 });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 2048);
}));

await check("fails closed for dirty trees and out-of-scope commit paths", async () => withRepository(async fixture => {
  const scope = await runCommitIntegrity({ ...fixture.options, allowed_paths: ["src/base.mjs"] });
  assert.equal(scope.verdict, "fail");
  assert.equal(scope.error_code, "INTEGRITY_FAILED");
  assert.equal(scope.checks.staging_scope, "fail");
  assert.equal(scope.counts.out_of_scope_paths, 1);
  await writeFile(path.join(fixture.repository, "untracked.txt"), "dirty\n");
  const dirty = await runCommitIntegrity(fixture.options);
  assert.equal(dirty.checks.tree_clean, "fail");
}));

await check("the no-source-change form skips only sha-backed checks", async () => withRepository(async fixture => {
  const result = await runCommitIntegrity({ ...fixture.options, reported_commit: "none" });
  assert.equal(result.verdict, "pass");
  assert.equal(result.checks.ancestry, "skipped");
  assert.equal(result.checks.baseline_movement, "skipped");
  assert.equal(result.checks.staging_scope, "skipped");
  assert.equal(result.checks.branch, "pass");
  assert.equal(result.checks.worktree, "pass");
}));

await check("the CLI atomically persists the full result and emits only a small receipt", async () => withRepository(async fixture => {
  const output = path.join(fixture.root, "integrity.json");
  const args = [
    helper, "--repository", fixture.repository, "--commit", fixture.commit,
    "--base-sha", fixture.baseSha, "--branch", "feature/integrity",
    "--worktree", fixture.repository, "--allowed-path", "src/task.mjs", "--output", output,
  ];
  const child = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  const receipt = JSON.parse(child.stdout);
  const bytes = await readFile(output);
  assert.equal(receipt.kind, "team_harness_commit_integrity_receipt");
  assert.equal(receipt.verdict, "pass");
  assert.equal(receipt.result_sha256, digest(bytes));
  assert.equal(receipt.result_bytes, bytes.length);
  assert.ok(Buffer.byteLength(child.stdout) < 1024);
  assert.equal(JSON.parse(bytes).verdict, "pass");
}));

await check("invalid CLI input executes no Git command and fails with a closed result", async () => {
  const child = spawnSync(process.execPath, [helper, "--repository", "/tmp"], { encoding: "utf8" });
  assert.equal(child.status, 1);
  const result = JSON.parse(child.stdout);
  assert.equal(result.error_code, "ARGUMENT_INVALID");
  assert.equal(isCommitIntegrityResult(result), true);
});

if (failures.length) {
  console.error(`${failures.length} commit-integrity checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
