#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  captureSnapshot,
  isOpenSpecSnapshot,
  isSnapshotAction,
  verifySnapshot,
} from "../plugins/team-harness/skills/pipeline/scripts/openspec-snapshot.mjs";

const failures = [];
const changeName = "snapshot-fixture";
const headSha = "a".repeat(40);

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

function commandEnvelope() {
  return {
    outcome: "completed", exit_code: 0,
    stdout: { tail: headSha, bytes: 40, truncated: false },
    stderr: { tail: null, bytes: 0, truncated: false },
  };
}

function toolchain(repository) {
  return {
    schema_version: 2,
    kind: "team_harness_openspec_adapter",
    operation: "preflight",
    outcome: "ready",
    error_code: null,
    evidence: {
      timestamp: "2026-08-17T12:00:00Z",
      node_version: "20.19.0",
      npm_version: "10.8.2",
      openspec_version: "1.9.0",
      executable: "openspec",
      runtime: "codex",
      project_root: repository,
      targets: [],
      diagnostic: null,
    },
  };
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "th-openspec-snapshot-"));
  const repository = path.join(root, "repository");
  const workspace = path.join(root, "workspace");
  const changeRoot = path.join(repository, "openspec/changes", changeName);
  await mkdir(path.join(changeRoot, "specs/example"), { recursive: true });
  await mkdir(workspace);
  const files = {
    metadata: path.join(changeRoot, ".openspec.yaml"),
    proposal: path.join(changeRoot, "proposal.md"),
    spec: path.join(changeRoot, "specs/example/spec.md"),
    design: path.join(changeRoot, "design.md"),
    tasks: path.join(changeRoot, "tasks.md"),
  };
  await writeFile(files.metadata, "schema: spec-driven\ncreated: 2026-08-17\n");
  await writeFile(files.proposal, "## Why\nReason\n\n## What Changes\nChange\n");
  await writeFile(files.spec, "## ADDED Requirements\n\n### Requirement: Example behavior\nThe system SHALL work.\n\n#### Scenario: Successful behavior\n- **WHEN** input is valid\n- **THEN** output is produced\n");
  await writeFile(files.design, "## Decisions\n\n### 1. Use an explicit boundary\nReason.\n");
  await writeFile(files.tasks, "## 1. Work\n\n- [x] 1.1 Existing work\n- [ ] 1.2 Pending work\n");
  const status = {
    changeName,
    schemaName: "spec-driven",
    planningHome: { kind: "repo", root: repository },
    changeRoot,
    artifactPaths: {
      proposal: { existingOutputPaths: [files.proposal] },
      specs: { existingOutputPaths: [files.spec] },
      design: { existingOutputPaths: [files.design] },
      tasks: { existingOutputPaths: [files.tasks] },
    },
    isPlanningComplete: true,
    actionContext: { mode: "repo-local" },
    artifacts: ["proposal", "specs", "design", "tasks"].map(id => ({ id, status: "done" })),
  };
  const validation = {
    items: [{ id: changeName, type: "change", valid: true, issues: [] }],
    summary: { totals: { items: 1, passed: 1, failed: 0 } },
  };
  const jsonRunner = async ({ argv }) => argv[1] === "status"
    ? { ok: true, value: status }
    : { ok: true, value: validation };
  return { root, repository, workspace, changeRoot, files, status, validation, jsonRunner };
}

async function withFixture(callback) {
  const fixture = await makeFixture();
  try { return await callback(fixture); } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

async function capture(fixture, overrides = {}) {
  return captureSnapshot({
    projectRoot: fixture.repository,
    workspaceRoot: fixture.workspace,
    changeName,
    toolchain: toolchain(fixture.repository),
    jsonRunner: fixture.jsonRunner,
    commandRunner: async () => commandEnvelope(),
    ...overrides,
  });
}

console.log("=== OpenSpec canonical snapshot ===");

await check("captures strict CLI-reported artifacts and stable coordinates", async () => withFixture(async fixture => {
  const result = await capture(fixture);
  assert.equal(isSnapshotAction(result), true);
  assert.equal(result.verdict, "pass");
  assert.equal(result.snapshot_path, path.join(fixture.workspace, "inputs/openspec-snapshot.json"));
  const snapshot = JSON.parse(await readFile(result.snapshot_path, "utf8"));
  assert.equal(isOpenSpecSnapshot(snapshot), true);
  assert.equal(snapshot.repository.head_sha, headSha);
  assert.deepEqual(snapshot.workspace, { root: fixture.workspace, mode: "local", navigation_kind: "repository-relative-coordinates" });
  assert.equal(snapshot.artifacts.length, 5);
  assert.deepEqual(snapshot.task_progress.completed, ["task:1.1"]);
  assert.ok(snapshot.artifacts.flatMap(item => item.coordinates).some(item => item.id === "scenario:example:example-behavior:successful-behavior"));
  const tasks = snapshot.artifacts.find(item => item.artifact_id === "tasks");
  assert.match(tasks.content_sha256, /^[a-f0-9]{64}$/);
  assert.match(tasks.intent_sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(tasks.content_sha256, tasks.intent_sha256);
}));

await check("rejects invalid strict validation and incomplete status", async () => withFixture(async fixture => {
  const invalidValidation = async ({ argv }) => argv[1] === "status"
    ? { ok: true, value: fixture.status }
    : { ok: true, value: { items: [{ id: changeName, type: "change", valid: false }], summary: { totals: { failed: 1 } } } };
  assert.equal((await capture(fixture, { jsonRunner: invalidValidation })).error_code, "VALIDATION_FAILED");
  fixture.status.artifacts.find(item => item.id === "tasks").status = "ready";
  assert.equal((await capture(fixture)).error_code, "ARTIFACT_INVALID");
}));

await check("rejects unbound change collisions and invented artifact paths", async () => withFixture(async fixture => {
  fixture.status.changeName = "different-change";
  assert.equal((await capture(fixture)).error_code, "BINDING_INVALID");
  fixture.status.changeName = changeName;
  const outside = path.join(fixture.root, "invented.md");
  await writeFile(outside, "## Why\noutside\n");
  fixture.status.artifactPaths.proposal.existingOutputPaths = [outside];
  assert.equal((await capture(fixture)).error_code, "ARTIFACT_INVALID");
}));

await check("rejects missing and duplicate source coordinates", async () => withFixture(async fixture => {
  await writeFile(fixture.files.spec, "### Requirement: Missing scenario\nThe system SHALL fail validation.\n");
  assert.equal((await capture(fixture)).error_code, "COORDINATE_INVALID");
  await writeFile(fixture.files.spec, "### Requirement: Example\nThe system SHALL work.\n\n#### Scenario: Works\n- **WHEN** ready\n- **THEN** done\n");
  await writeFile(fixture.files.tasks, "- [ ] 1.1 First\n- [ ] 1.1 Duplicate\n");
  assert.equal((await capture(fixture)).error_code, "COORDINATE_INVALID");
}));

await check("blocks every raw source change before Gate 1", async () => withFixture(async fixture => {
  const captured = await capture(fixture);
  await writeFile(fixture.files.proposal, "## Why\nChanged intent\n\n## What Changes\nChange\n");
  const result = await verifySnapshot({ snapshotPath: captured.snapshot_path, phase: "pre-gate1" });
  assert.equal(result.error_code, "SOURCE_CHANGED");
  assert.deepEqual(result.changed, [path.relative(fixture.repository, fixture.files.proposal).replaceAll("\\", "/")]);
}));

await check("records only an authorized monotonic checkbox transition", async () => withFixture(async fixture => {
  const captured = await capture(fixture);
  await writeFile(fixture.files.tasks, "## 1. Work\n\n- [x] 1.1 Existing work\n- [x] 1.2 Pending work\n");
  const beforeGate = await verifySnapshot({ snapshotPath: captured.snapshot_path, phase: "pre-gate1" });
  assert.equal(beforeGate.error_code, "SOURCE_CHANGED");
  const unauthorized = await verifySnapshot({ snapshotPath: captured.snapshot_path, phase: "implementation", authorizedTaskIds: [] });
  assert.equal(unauthorized.error_code, "TASK_PROGRESS_INVALID");
  const advanced = await verifySnapshot({ snapshotPath: captured.snapshot_path, phase: "implementation", authorizedTaskIds: ["task:1.2"] });
  assert.equal(advanced.verdict, "pass");
  const snapshot = JSON.parse(await readFile(captured.snapshot_path, "utf8"));
  assert.deepEqual(snapshot.task_progress.completed, ["task:1.1", "task:1.2"]);
  assert.equal(snapshot.task_progress.events.length, 1);
}));

await check("blocks task intent edits and completion rollback", async () => withFixture(async fixture => {
  const intentCapture = await capture(fixture);
  await writeFile(fixture.files.tasks, "## 1. Work\n\n- [x] 1.1 Existing work\n- [ ] 1.2 Changed task text\n");
  assert.equal((await verifySnapshot({
    snapshotPath: intentCapture.snapshot_path, phase: "implementation", authorizedTaskIds: ["task:1.2"],
  })).error_code, "TASK_INTENT_CHANGED");

  await rm(path.join(fixture.workspace, "inputs"), { recursive: true, force: true });
  await writeFile(fixture.files.tasks, "## 1. Work\n\n- [x] 1.1 Existing work\n- [x] 1.2 Pending work\n");
  const rollbackCapture = await capture(fixture);
  await writeFile(fixture.files.tasks, "## 1. Work\n\n- [x] 1.1 Existing work\n- [ ] 1.2 Pending work\n");
  assert.equal((await verifySnapshot({
    snapshotPath: rollbackCapture.snapshot_path, phase: "implementation", authorizedTaskIds: [],
  })).error_code, "TASK_PROGRESS_INVALID");
}));

if (failures.length) {
  console.error(`${failures.length} OpenSpec snapshot checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
