#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateOpenSpecOverlay } from "../plugins/team-harness/skills/pipeline/scripts/openspec-overlay.mjs";
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
  await mkdir(repository);
  const artifacts = [
    { artifact_id: "metadata", path: "openspec/changes/example/.openspec.yaml", content_sha256: "1".repeat(64), intent_sha256: null, coordinates: [] },
    { artifact_id: "specs", path: "openspec/changes/example/specs/example/spec.md", content_sha256: "2".repeat(64), intent_sha256: null, coordinates: [
      coordinate("requirement", "requirement:example:behavior"), coordinate("scenario", "scenario:example:behavior:works"),
    ] },
    { artifact_id: "design", path: "openspec/changes/example/design.md", content_sha256: "3".repeat(64), intent_sha256: null, coordinates: [coordinate("design-decision", "design:boundary")] },
    { artifact_id: "tasks", path: "openspec/changes/example/tasks.md", content_sha256: "4".repeat(64), intent_sha256: "5".repeat(64), coordinates: [{ ...coordinate("task", "task:1.1"), complete: false }] },
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
  for (const id of [1, 2, 3]) await writeFile(path.join(workspace, `plan/tasks/Task-${id}.md`), `# Task-${id}\n`);
  const acceptance = id => ({ id, sources: [], classification: "th-extension", rationale: "TH-only acceptance control.", evidence_anchor: "reviews/04-validation.md" });
  const execution = id => ({
    id, sources: [], classification: "th-extension", rationale: "TH-only execution control.", owner: "implementer", specialist: "implementer",
    shard_path: `plan/tasks/${id}.md`, files: [`src/${id}.mjs`], dependencies: [], invariants: ["Preserve gate authority."],
    technical_constraints: [], quality_command_ids: ["unit"], pre_implementation_test: "required",
    evidence_anchors: ["02-implementation.md"], rollback: "Revert the bounded task commit.", delivery_group: "default",
  });
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
  const writeOverlay = async value => writeFile(path.join(workspace, "plan/openspec-traceability.json"), `${JSON.stringify(value)}\n`);
  return { root, workspace, overlay, writeOverlay };
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

console.log("=== OpenSpec execution overlay ===");

await check("passes direct bidirectional mappings through plan-contract dispatch", async () => withFixture(async value => {
  makeDirect(value.overlay);
  await value.writeOverlay(value.overlay);
  const result = await validatePlanContract({ workspace: value.workspace, plan: "01-plan.md", snapshot: "inputs/openspec-snapshot.json", traceability: "plan/openspec-traceability.json" });
  assert.equal(result.verdict, "pass");
  assert.equal(result.kind, "team_harness_openspec_overlay_validation");
}));

await check("passes disclosed split, merged, extension, and exclusion mappings", async () => withFixture(async value => {
  makeTransformed(value.overlay);
  await value.writeOverlay(value.overlay);
  assert.equal((await validateOpenSpecOverlay({ workspace: value.workspace })).verdict, "pass");
}));

await check("blocks ambiguous mappings and missing disclosures", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.acceptance_items[0].classification = "ambiguous";
  value.overlay.acceptance_items[0].rationale = "Cannot establish the binding.";
  await value.writeOverlay(value.overlay);
  const result = await validateOpenSpecOverlay({ workspace: value.workspace });
  assert.ok(result.findings.some(item => item.code === "AMBIGUOUS_MAPPING"));
  assert.ok(result.findings.some(item => item.code === "DISCLOSURE_INCOMPLETE"));
}));

await check("blocks dangling and incomplete reverse coverage", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.source_dispositions.pop();
  await value.writeOverlay(value.overlay);
  const result = await validateOpenSpecOverlay({ workspace: value.workspace });
  assert.ok(result.findings.some(item => item.code === "SOURCE_COVERAGE_INCOMPLETE"));
  assert.ok(result.findings.some(item => item.code === "REVERSE_MAPPING_INVALID"));
}));

await check("blocks stale snapshot identity and duplicate items", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.snapshot.sha256 = "0".repeat(64);
  value.overlay.execution_items[1].id = "Task-1";
  await value.writeOverlay(value.overlay);
  const result = await validateOpenSpecOverlay({ workspace: value.workspace });
  assert.ok(result.findings.some(item => item.code === "SNAPSHOT_STALE"));
  assert.ok(result.findings.some(item => item.code === "ITEM_DUPLICATE"));
}));

await check("blocks normative prose fields instead of asserting semantic equivalence", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.acceptance_items[0].source_text = "Given copied intent, when duplicated, then reject it.";
  await value.writeOverlay(value.overlay);
  const result = await validateOpenSpecOverlay({ workspace: value.workspace });
  assert.ok(result.findings.some(item => item.code === "NORMATIVE_TEXT_DUPLICATED"));
  assert.ok(result.findings.some(item => item.code === "ITEM_SCHEMA_INVALID"));
}));

await check("blocks unsafe shards and incomplete operational controls", async () => withFixture(async value => {
  makeDirect(value.overlay);
  value.overlay.execution_items[0].shard_path = "../escape.md";
  value.overlay.execution_items[0].quality_command_ids = ["invented"];
  await value.writeOverlay(value.overlay);
  const result = await validateOpenSpecOverlay({ workspace: value.workspace });
  assert.ok(result.findings.some(item => item.code === "EXECUTION_CONTROL_INVALID"));
  assert.ok(result.findings.some(item => item.code === "SHARD_INVALID"));
}));

if (failures.length) {
  console.error(`${failures.length} OpenSpec overlay checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
