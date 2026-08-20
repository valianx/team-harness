#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { CHECKERS, canonicalSourceFor, computeReviewSurface, mirrorFor, provenMirrors } from "../skills/pipeline/scripts/review-surface.mjs";

const run = promisify(execFile);
const failures = [];
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function git(root, args) {
  await run("git", ["-C", root, ...args], { windowsHide: true });
}

async function write(root, relative, body) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function withRepository(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-review-surface-"));
  try {
    await git(root, ["init", "-q", "-b", "main"]);
    await git(root, ["config", "user.email", "test@example.invalid"]);
    await git(root, ["config", "user.name", "Test"]);
    await write(root, "README.md", "base\n");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-q", "-m", "base"]);
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

console.log("=== Review surface ===");

await check("maps every projection family to its canonical source", () => {
  const cases = [
    ["plugins/team-harness/agents/qa.md", "agents/qa.md"],
    ["plugins/team-harness/agents/_shared/gate-contract.md", "agents/_shared/gate-contract.md"],
    ["plugins/team-harness/hooks/run-ts-hook.sh", "hooks/run-ts-hook.sh"],
    ["plugins/team-harness/docs/pipeline-lanes.md", "docs/pipeline-lanes.md"],
    ["plugins/team-harness/.claude-plugin/plugin.json", ".claude-plugin/plugin.json"],
    ["plugins/team-harness/skills/pipeline/scripts/quality-runner.mjs", "skills/pipeline/scripts/quality-runner.mjs"],
    ["installer-assets/opencode-skills/review-pr/scripts/review_context.py", "skills/review-pr/scripts/review_context.py"],
  ];
  for (const [projection, expected] of cases) assert.equal(canonicalSourceFor(projection), expected);
});

await check("maps a derived artifact to no source, so it stays in review", () => {
  for (const derived of [
    "plugins/team-harness/skills/verify/SKILL.md",
    "plugins/team-harness/skills/verify/canonical.md",
    ".codex/agents/qa.toml",
    "runtime/codex/instructions/qa.md",
    "agents/qa.md",
    "docs/observability.md",
  ]) {
    assert.equal(canonicalSourceFor(derived), null, derived);
  }
});

await check("withholds every exclusion when a covering checker cannot run", async () => withRepository(async (root) => {
  await write(root, "agents/a.md", "canonical\n");
  await write(root, "plugins/team-harness/agents/a.md", "canonical\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "mirror"]);
  const result = await computeReviewSurface({ repoRoot: root, range: "HEAD~1..HEAD" });
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.excluded, []);
  assert.deepEqual(result.pathspec, []);
  assert.equal(result.fully_verified, false);
  assert.ok(result.withheld_by.length > 0, "no withholding checker was named");
}));

await check("names the checker that withheld eligibility", async () => withRepository(async (root) => {
  await write(root, "agents/a.md", "x\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "change"]);
  const result = await computeReviewSurface({ repoRoot: root, range: "HEAD~1..HEAD" });
  const names = CHECKERS.map((entry) => entry.name);
  for (const entry of result.withheld_by) {
    assert.ok(names.some((name) => entry.startsWith(`${name}:`)), `unknown withholding entry ${entry}`);
  }
}));

await check("refuses a range that does not resolve", async () => withRepository(async (root) => {
  const result = await computeReviewSurface({ repoRoot: root, range: "nosuchref..HEAD" });
  assert.equal(result.verdict, "fail");
  assert.equal(result.error_code, "RANGE_NOT_COMMITTED");
}));

await check("refuses a missing range argument", async () => {
  const result = await computeReviewSurface({});
  assert.equal(result.error_code, "ARGUMENT_INVALID");
});

await check("excludes only byte-identical mirrors on the real repository", async () => {
  const result = await computeReviewSurface({ repoRoot: REPO_ROOT, range: "HEAD~1..HEAD" });
  assert.equal(result.verdict, "pass");
  for (const entry of result.excluded) {
    assert.equal(canonicalSourceFor(entry.path), entry.source);
    assert.equal(entry.provenance, "byte-identical-mirror");
  }
});

await check("proves mirror equality at the reviewed head, not at whatever is checked out", async () => withRepository(async (root) => {
  // The projection is identical to its source at the first commit and drifts at the second.
  await write(root, "agents/a.md", "canonical v1\n");
  await write(root, "plugins/team-harness/agents/a.md", "canonical v1\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "identical"]);
  const identical = (await run("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();

  await write(root, "agents/a.md", "canonical v2\n");
  await write(root, "plugins/team-harness/agents/a.md", "STALE MIRROR\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "drifted"]);
  const drifted = (await run("git", ["-C", root, "rev-parse", "HEAD"])).stdout.trim();

  // Check out the identical commit, then ask about the drifted one. Reading the working tree
  // would report the mirror as byte-identical; reading the reviewed head must not.
  await git(root, ["checkout", "-q", identical]);
  const paths = ["plugins/team-harness/agents/a.md"];
  assert.deepEqual(
    (await provenMirrors(root, drifted, paths)).map((entry) => entry.path),
    [],
    "a mirror that drifted at the reviewed head was excluded from the review surface",
  );
  assert.deepEqual(
    (await provenMirrors(root, identical, paths)).map((entry) => entry.path),
    paths,
    "a mirror identical at the reviewed head was not excluded",
  );
}));

await check("emits literal exclude pathspecs so a metacharacter cannot widen the exclusion", async () => {
  const result = await computeReviewSurface({ repoRoot: REPO_ROOT, range: "HEAD~1..HEAD" });
  for (const entry of result.pathspec) {
    assert.ok(entry.startsWith(":(literal,exclude)"), `non-literal pathspec: ${entry}`);
    assert.equal(entry.slice(":(literal,exclude)".length).length > 0, true);
  }
  assert.equal(result.pathspec.length, result.excluded.length);
});

await check("attributes each exclusion to the checker that proves it", () => {
  assert.equal(mirrorFor("plugins/team-harness/hooks/dist/policy-block.cjs").checker, "sync-hooks");
  assert.equal(mirrorFor("plugins/team-harness/agents/qa.md").checker, "sync-skills");
  assert.equal(mirrorFor("runtime/codex/instructions/qa.md"), null);
});

if (failures.length > 0) {
  console.error(`${failures.length} review surface checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
