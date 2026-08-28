#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCodeHygiene } from "../skills/pipeline/scripts/code-hygiene.mjs";

const helper = fileURLToPath(new URL("../skills/pipeline/scripts/code-hygiene.mjs", import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), "th-code-hygiene-"));
const repository = path.join(root, "repository");
const workspace = path.join(root, "workspace");

const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();

try {
  await mkdir(path.join(repository, "src"), { recursive: true });
  await mkdir(path.join(repository, "docs"), { recursive: true });
  await mkdir(path.join(workspace, "evidence", "hygiene"), { recursive: true });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Team Harness Test");
  git("config", "user.email", "team-harness@example.invalid");
  await writeFile(path.join(repository, "src", "app.js"), "export const value = 1;\n");
  await writeFile(path.join(repository, "docs", "note.md"), "# Notes\n");
  git("add", "src/app.js", "docs/note.md");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");

  await writeFile(path.join(repository, "src", "app.js"), "// Phase 2 implementation\nexport const value = 2;\n");
  await writeFile(path.join(repository, "docs", "note.md"), "# Phase 2 implementation\n");
  git("add", "src/app.js", "docs/note.md");
  git("commit", "-q", "-m", "violation");
  const violatingCandidate = git("rev-parse", "HEAD");
  const violation = await runCodeHygiene({ repo: repository, base, candidate: violatingCandidate });
  assert.equal(violation.verdict, "fail");
  assert.equal(violation.error_code, "WORK_NARRATION_DETECTED");
  assert.deepEqual(violation.violations, [{ path: "src/app.js", line: 1, pattern: "phase-narration" }]);

  const violationOutput = path.join(workspace, "evidence", "hygiene", "violation.json");
  const violationCli = spawnSync(process.execPath, [
    helper, "--repo", repository, "--workspace", workspace, "--base", base,
    "--candidate", violatingCandidate, "--output", violationOutput,
  ], { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 });
  assert.equal(violationCli.status, 1);
  const violationReceipt = JSON.parse(violationCli.stdout);
  assert.equal(violationReceipt.kind, "team_harness_code_hygiene_receipt");
  assert.equal(violationReceipt.verdict, "fail");
  assert.equal(JSON.parse(await readFile(violationOutput, "utf8")).error_code, "WORK_NARRATION_DETECTED");

  await writeFile(path.join(repository, "src", "app.js"), "// Preserve the public binding for consumers.\nexport const value = 2;\n");
  git("add", "src/app.js");
  git("commit", "-q", "-m", "clean hygiene");
  const cleanCandidate = git("rev-parse", "HEAD");
  const cleanOutput = path.join(workspace, "evidence", "hygiene", "clean.json");
  const cleanCli = spawnSync(process.execPath, [
    helper, "--repo", repository, "--workspace", workspace, "--base", base,
    "--candidate", cleanCandidate, "--output", cleanOutput,
  ], { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 });
  assert.equal(cleanCli.status, 0, cleanCli.stderr);
  const cleanReceipt = JSON.parse(cleanCli.stdout);
  assert.equal(cleanReceipt.verdict, "pass");
  const clean = JSON.parse(await readFile(cleanOutput, "utf8"));
  assert.equal(clean.verdict, "pass");
  assert.deepEqual(clean.violations, []);

  const invalid = spawnSync(process.execPath, [helper], { encoding: "utf8", timeout: 10_000 });
  assert.notEqual(invalid.status, 0);
  const invalidReceipt = JSON.parse(invalid.stdout);
  assert.equal(invalidReceipt.kind, "team_harness_code_hygiene_receipt");
  assert.equal(invalidReceipt.error_code, "ARGUMENT_INVALID");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("code hygiene: PASS");
