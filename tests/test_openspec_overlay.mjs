#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { rebindOpenSpecOverlay, validateOpenSpecOverlay, verifyAndRebindOpenSpecProgress } from "../plugins/team-harness/skills/pipeline/scripts/openspec-overlay.mjs";
import { verifySnapshot } from "../plugins/team-harness/skills/pipeline/scripts/openspec-snapshot.mjs";
import { validatePlanContract } from "../plugins/team-harness/skills/pipeline/scripts/plan-contract.mjs";

const failures = [];
const digest = value => createHash("sha256").update(value).digest("hex");

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

function coordinate(kind, id) { return { kind, id, title: id, line: 1 }; }

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "th-openspec-overlay-"));
  const repository = path.join(root, "repository");
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "inputs"), { recursive: true });
  await mkdir(path.join(workspace, "plan/tasks"), { recursive: true });
  const changeRoot = path.join(repository, "openspec/changes/example");
  await mkdir(path.join(changeRoot, "specs/example"), { recursive: true });
  const sourceBytes = {
    metadata: Buffer.from("schema: spec-driven\n"),
    specs: Buffer.from("### Requirement: Behavior\nThe system SHALL work.\n\n#### Scenario: Works\n- **WHEN** ready\n- **THEN** done\n"),
    design: Buffer.from("### Boundary\nUse a boundary.\n"),
    tasks: Buffer.from("- [ ] 1.1 Work\n"),
  };
  await writeFile(path.join(changeRoot, ".openspec.yaml"), sourceBytes.metadata);
  await writeFile(path.join(changeRoot, "specs/example/spec.md"), sourceBytes.specs);
  await writeFile(path.join(changeRoot, "design.md"), sourceBytes.design);
  await writeFile(path.join(changeRoot, "tasks.md"), sourceBytes.tasks);
  const artifacts = [
    { artifact_id: "metadata", path: "openspec/changes/example/.openspec.yaml", content_sha256: digest(sourceBytes.metadata), intent_sha256: null, coordinates: [] },
    { artifact_id: "specs", path: "openspec/changes/example/specs/example/spec.md", content_sha256: digest(sourceBytes.specs), intent_sha256: null, coordinates: [
      coordinate("requirement", "requirement:example:behavior"), coordinate("scenario", "scenario:example:behavior:works"),
    ] },
    { artifact_id: "design", path: "openspec/changes/example/design.md", content_sha256: digest(sourceBytes.design), intent_sha256: null, coordinates: [coordinate("design-decision", "design:boundary")] },
    { artifact_id: "tasks", path: "openspec/changes/example/tasks.md", content_sha256: digest(sourceBytes.tasks), intent_sha256: digest(sourceBytes.tasks), coordinates: [{ ...coordinate("task", "task:1.1"), complete: false }] },
  ];
  const snapshot = {
    schema_version: 2, kind: "team_harness_openspec_snapshot", captured_at: "2026-08-17T12:00:00Z",
    repository: { root: repository, head_sha: "a".repeat(40) },
    workspace: { root: workspace, mode: "local", navigation_kind: "repository-relative-coordinates" },
    toolchain: { runtime: "codex", node_version: "20.19.0", npm_version: "10.8.2", openspec_version: "1.9.0", generated_targets: [] },
    change: { name: "example", schema: "spec-driven", root: path.join(repository, "openspec/changes/example") },
    artifacts,
    artifact_set_sha256: digest(Buffer.from(artifacts.map(item => `${item.path}\0${item.content_sha256}`).join("\n"))),
    task_progress: { completed: [], events: [] },
  };
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot)}\n`);
  await writeFile(path.join(workspace, "inputs/openspec-snapshot.json"), snapshotBytes);
  await writeFile(path.join(workspace, "01-plan.md"), "**Plan format:** sharded-v1\n");
  const acceptance = id => ({ id, sources: [], classification: "th-extension", rationale: "TH-only acceptance control.", evidence_anchor: "reviews/04-validation.md" });
  const execution = id => ({
    id, sources: [], classification: "th-extension", rationale: "TH-only execution control.", owner: "implementer", specialist: "implementer",
    shard_path: `plan/tasks/${id}.md`, files: [`src/${id}.mjs`], dependencies: [], required_invariants: ["I-gate-authority"],
    technical_constraints: [], quality_command_ids: ["unit"], pre_implementation_test: "required",
    required_evidence_anchors: ["02-implementation.md"], cross_runtime_preservation: "Preserve equivalent behavior in every supported runtime.",
    rollback: "Revert the bounded task commit.", delivery_group: "default",
  });
  const shard = item => `# ${item.id}\n\n- **Worktree:** null — branch null, base null\n\n## Dispatch anchors\n\nrequired_invariants: [${item.required_invariants.join(", ")}]\nrequired_evidence_anchors: [${item.required_evidence_anchors.join(", ")}]\ncross_runtime_preservation: ${item.cross_runtime_preservation}\n`;
  const overlay = {
    schema_version: 1, kind: "team_harness_openspec_execution_overlay", plan_format: "sharded-v1",
    snapshot: { path: "inputs/openspec-snapshot.json", sha256: digest(snapshotBytes), artifact_set_sha256: snapshot.artifact_set_sha256, change_name: "example" },
    repository: { root: repository, ownership: [{ path: "src", owner: "implementer" }] },
    quality_commands: [{ id: "unit" }],
    freeze: { baseline_sha256: "b".repeat(64), state_anchor: "00-state.json", evidence_root: "reviews" },
    acceptance_items: [acceptance("AC-1"), acceptance("AC-2")],
    execution_items: [execution("Task-1"), execution("Task-2")],
    source_dispositions: [], operator_disclosures: [],
  };
  for (const item of [...overlay.execution_items, execution("Task-3")]) {
    await writeFile(path.join(workspace, item.shard_path), shard(item));
  }
  const writeOverlay = async value => writeFile(path.join(workspace, "plan/openspec-traceability.json"), `${JSON.stringify(value)}\n`);
  return { root, repository, workspace, overlay, writeOverlay };
}

async function withFixture(callback) {
  const value = await fixture();
  try { await callback(value); } finally { await rm(value.root, { recursive: true, force: true }); }
}

function makeDirect(overlay) {
  const pairs = [
    [overlay.acceptance_items[0], "requirement:example:behavior"],
    [overlay.acceptance_items[1], "scenario:example:behavior:works"],
    [overlay.execution_items[0], "design:boundary"],
    [overlay.execution_items[1], "task:1.1"],
  ];
  for (const [item, source] of pairs) Object.assign(item, { sources: [source], classification: "direct", rationale: null });
  overlay.source_dispositions = pairs.map(([item, source]) => ({ source_id: source, item_ids: [item.id], classification: "direct", rationale: null }));
  overlay.operator_disclosures = [];
}

function makeTransformed(overlay) {
  overlay.acceptance_items = [overlay.acceptance_items[0]];
  Object.assign(overlay.acceptance_items[0], {
    sources: ["requirement:example:behavior", "scenario:example:behavior:works"], classification: "merged", rationale: "One observable acceptance item covers the requirement scenario.",
  });
  Object.assign(overlay.execution_items[0], { sources: ["design:boundary"], classification: "split", rationale: "First bounded ownership lane." });
  Object.assign(overlay.execution_items[1], { sources: ["design:boundary"], classification: "split", rationale: "Second bounded ownership lane." });
  overlay.execution_items.push({ ...overlay.execution_items[0], id: "Task-3", sources: [], classification: "th-extension", rationale: "Adds TH evidence wiring.", shard_path: "plan/tasks/Task-3.md", files: ["evidence/index.json"] });
  overlay.source_dispositions = [
    { source_id: "requirement:example:behavior", item_ids: ["AC-1"], classification: "merged", rationale: "Covered with its scenario." },
    { source_id: "scenario:example:behavior:works", item_ids: ["AC-1"], classification: "merged", rationale: "Covered with its requirement." },
    { source_id: "design:boundary", item_ids: ["Task-1", "Task-2"], classification: "split", rationale: "Implemented in two ownership lanes." },
    { source_id: "task:1.1", item_ids: [], classification: "excluded", rationale: "Already completed upstream." },
  ];
  const records = [
    ...overlay.acceptance_items, ...overlay.execution_items, ...overlay.source_dispositions,
  ].filter(entry => entry.classification !== "direct").map(entry => ({
    mapping_id: entry.id ?? entry.source_id, classification: entry.classification, rationale: entry.rationale,
  }));
  overlay.operator_disclosures = records;
}

const validateOverlay = value => validateOpenSpecOverlay({ workspace: value.workspace, writableRoots: [value.repository] });

console.log("=== OpenSpec execution overlay ===");

await check("passes direct bidirectional mappings through plan-contract dispatch", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const result = await validatePlanContract({ workspace: value.workspace, plan: "01-plan.md", snapshot: "inputs/openspec-snapshot.json", traceability: "plan/openspec-traceability.json", writableRoots: [value.repository] });
  assert.equal(result.verdict, "pass");
  assert.equal(result.kind, "team_harness_openspec_overlay_validation");
}));

await check("passes disclosed split, merged, extension, and exclusion mappings", async () => withFixture(async value => {
  makeTransformed(value.overlay);
  await value.writeOverlay(value.overlay);
  assert.equal((await validateOverlay(value)).verdict, "pass");
}));

await check("blocks ambiguous mappings and missing disclosures", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.acceptance_items[0].classification = "ambiguous";
  value.overlay.acceptance_items[0].rationale = "Cannot establish the binding.";
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "AMBIGUOUS_MAPPING"));
  assert.ok(result.findings.some(item => item.code === "DISCLOSURE_INCOMPLETE"));
}));

await check("blocks dangling and incomplete reverse coverage", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.source_dispositions.pop();
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "SOURCE_COVERAGE_INCOMPLETE"));
  assert.ok(result.findings.some(item => item.code === "REVERSE_MAPPING_INVALID"));
}));

await check("blocks stale snapshot identity and duplicate items", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.snapshot.sha256 = "0".repeat(64);
  value.overlay.execution_items[1].id = "Task-1";
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "SNAPSHOT_STALE"));
  assert.ok(result.findings.some(item => item.code === "ITEM_DUPLICATE"));
}));

await check("mechanically rebinds only the latest verified monotonic task-progress snapshot", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const snapshotPath = path.join(value.workspace, "inputs/openspec-snapshot.json");
  const originalBytes = await readFile(snapshotPath);
  const snapshot = JSON.parse(originalBytes.toString("utf8"));
  const tasks = snapshot.artifacts.find(item => item.artifact_id === "tasks");
  tasks.content_sha256 = "6".repeat(64);
  tasks.coordinates[0].complete = true;
  snapshot.task_progress.completed = ["task:1.1"];
  snapshot.task_progress.events.push({
    recorded_at: "2026-08-17T12:01:00Z",
    task_ids: ["task:1.1"],
    previous_sha256: digest(originalBytes),
    task_content_sha256: tasks.content_sha256,
  });
  snapshot.artifact_set_sha256 = digest(Buffer.from(snapshot.artifacts.map(item => `${item.path}\0${item.content_sha256}`).join("\n")));
  await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);

  assert.equal((await validateOverlay(value)).error_code, "SNAPSHOT_STALE");
  const rebound = await rebindOpenSpecOverlay({ workspace: value.workspace, writableRoots: [value.repository] });
  assert.equal(rebound.verdict, "pass");
  assert.equal(rebound.changed, true);
  assert.equal(rebound.previous_snapshot_sha256, digest(originalBytes));
  assert.equal((await validateOverlay(value)).verdict, "pass");
  const overlay = JSON.parse(await readFile(path.join(value.workspace, "plan/openspec-traceability.json"), "utf8"));
  assert.equal(overlay.snapshot.sha256, digest(Buffer.from(`${JSON.stringify(snapshot)}\n`)));
  assert.equal(overlay.snapshot.artifact_set_sha256, snapshot.artifact_set_sha256);
  assert.equal((await rebindOpenSpecOverlay({ workspace: value.workspace, writableRoots: [value.repository] })).changed, false);
}));

await check("verifies and rebinds authorized task progress as one idempotent recoverable operation", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const tasksPath = path.join(value.repository, "openspec/changes/example/tasks.md");
  await writeFile(tasksPath, "- [x] 1.1 Work\n");
  const advanced = await verifyAndRebindOpenSpecProgress({
    workspace: value.workspace,
    writableRoots: [value.repository],
    authorizedTaskIds: ["task:1.1"],
  });
  assert.equal(advanced.verdict, "pass");
  assert.equal(advanced.changed, true);
  assert.equal(advanced.recovered, false);
  assert.equal((await validateOverlay(value)).verdict, "pass");
  const repeated = await verifyAndRebindOpenSpecProgress({
    workspace: value.workspace,
    writableRoots: [value.repository],
    authorizedTaskIds: ["task:1.1"],
  });
  assert.equal(repeated.verdict, "pass");
  assert.equal(repeated.changed, false);
}));

await check("recovers an interrupted verified progress write only for the exact authorized event", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const snapshotPath = path.join(value.workspace, "inputs/openspec-snapshot.json");
  await writeFile(path.join(value.repository, "openspec/changes/example/tasks.md"), "- [x] 1.1 Work\n");
  const verified = await verifySnapshot({ snapshotPath, phase: "implementation", authorizedTaskIds: ["task:1.1"] });
  assert.equal(verified.verdict, "pass");
  assert.equal((await validateOverlay(value)).error_code, "SNAPSHOT_STALE");
  const recovered = await verifyAndRebindOpenSpecProgress({
    workspace: value.workspace,
    writableRoots: [value.repository],
    authorizedTaskIds: ["task:1.1"],
  });
  assert.equal(recovered.verdict, "pass");
  assert.equal(recovered.recovered, true);
  assert.equal((await validateOverlay(value)).verdict, "pass");
}));

await check("refuses stale overlays without an immediate verified progress predecessor", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const snapshotPath = path.join(value.workspace, "inputs/openspec-snapshot.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const tasks = snapshot.artifacts.find(item => item.artifact_id === "tasks");
  tasks.content_sha256 = "6".repeat(64);
  tasks.coordinates[0].complete = true;
  snapshot.task_progress.completed = ["task:1.1"];
  snapshot.task_progress.events.push({
    recorded_at: "2026-08-17T12:01:00Z", task_ids: ["task:1.1"],
    previous_sha256: "f".repeat(64), task_content_sha256: tasks.content_sha256,
  });
  snapshot.artifact_set_sha256 = digest(Buffer.from(snapshot.artifacts.map(item => `${item.path}\0${item.content_sha256}`).join("\n")));
  await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);
  const before = await readFile(path.join(value.workspace, "plan/openspec-traceability.json"));
  const result = await rebindOpenSpecOverlay({ workspace: value.workspace, writableRoots: [value.repository] });
  assert.equal(result.error_code, "PROGRESS_CHAIN_INVALID");
  assert.deepEqual(await readFile(path.join(value.workspace, "plan/openspec-traceability.json")), before);
}));

await check("blocks normative prose fields instead of asserting semantic equivalence", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.acceptance_items[0].source_text = "Given copied intent, when duplicated, then reject it.";
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "NORMATIVE_TEXT_DUPLICATED"));
  assert.ok(result.findings.some(item => item.code === "ITEM_SCHEMA_INVALID"));
}));

await check("blocks unsafe shards and incomplete operational controls", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.execution_items[0].shard_path = "../escape.md";
  value.overlay.execution_items[0].quality_command_ids = ["invented"];
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "EXECUTION_CONTROL_INVALID"));
  assert.ok(result.findings.some(item => item.code === "SHARD_INVALID"));
}));

await check("treats every shard invariant declaration as effective overlay scope", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const shardPath = path.join(value.workspace, "plan/tasks/Task-1.md");
  const shard = await readFile(shardPath, "utf8");
  await writeFile(shardPath, `- **Required invariants:** I-gate-authority, I-extra\n${shard}`);
  const stale = await validateOverlay(value);
  assert.ok(stale.findings.some(item => item.code === "DISPATCH_ANCHOR_MISMATCH" && item.target === "Task-1"));
  value.overlay.execution_items[0].required_invariants.push("I-extra");
  await value.writeOverlay(value.overlay);
  assert.equal((await validateOverlay(value)).verdict, "pass");
}));

await check("blocks missing or mismatched task dispatch anchors before Gate 1", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await writeFile(path.join(value.workspace, "plan/tasks/Task-1.md"), "# Task-1\n\n- **Worktree:** null — branch null, base null\n");
  value.overlay.execution_items[1].cross_runtime_preservation = "A mismatched preservation declaration.";
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "DISPATCH_ANCHOR_INVALID"));
  assert.ok(result.findings.some(item => item.code === "DISPATCH_ANCHOR_MISMATCH"));
}));

await check("blocks an execution worktree outside the effective writable roots", async () => withFixture(async value => {
  makeDirect(value.overlay);
  const taskPath = path.join(value.workspace, "plan/tasks/Task-1.md");
  const shard = await readFile(taskPath, "utf8");
  await writeFile(taskPath, shard.replace("- **Worktree:** null", "- **Worktree:** /outside/sandbox/worktree"));
  await value.writeOverlay(value.overlay);
  const result = await validateOverlay(value);
  assert.ok(result.findings.some(item => item.code === "EXECUTION_ROOT_NOT_WRITABLE"));
}));

await check("requires the live writable-root set for OpenSpec Gate-1 validation", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const result = await validateOpenSpecOverlay({ workspace: value.workspace });
  assert.equal(result.error_code, "ARGUMENT_INVALID");
}));

if (failures.length) {
  console.error(`${failures.length} OpenSpec overlay checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
