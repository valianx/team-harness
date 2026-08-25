#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { preflight } from "../plugins/team-harness/skills/pipeline/scripts/openspec-adapter.mjs";
import { deriveOpenSpecOverlay, validateOpenSpecOverlay } from "../plugins/team-harness/skills/pipeline/scripts/openspec-overlay.mjs";
import { captureSnapshot } from "../plugins/team-harness/skills/pipeline/scripts/openspec-snapshot.mjs";
import { validatePlanContract } from "../plugins/team-harness/skills/pipeline/scripts/plan-contract.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function run(argv, cwd) { return execFileSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 }); }

try {
  if (run(["openspec", "--version"], process.cwd()).trim() !== "1.9.0") throw new Error("version");
} catch {
  process.stdout.write("OpenSpec Design real E2E: SKIP (compatible OpenSpec 1.9.0 is not installed)\n");
  process.exit(0);
}

async function scenario(workspaceMode) {
  const root = await mkdtemp(path.join(tmpdir(), `th-openspec-e2e-${workspaceMode}-`));
  const repository = path.join(root, "repository");
  const workspace = workspaceMode === "obsidian"
    ? path.join(root, "vault", "Work", "work-logs", "project", "change")
    : path.join(root, "workspaces", "change");
  await mkdir(repository, { recursive: true });
  await mkdir(path.join(workspace, "plan/tasks"), { recursive: true });
  try {
    run(["git", "init", "-q", "-b", "main"], repository);
    run(["openspec", "init", "--tools", "codex", "--no-animation", "--no-copilot-cloud", repository], repository);
    run(["git", "add", "."], repository);
    run(["git", "-c", "user.name=TH E2E", "-c", "user.email=th-e2e@example.invalid", "commit", "-q", "-m", "baseline"], repository);
    const baseSha = run(["git", "rev-parse", "HEAD"], repository).trim();
    run(["openspec", "new", "change", "canonical-e2e", "--schema", "spec-driven", "--json"], repository);
    const change = path.join(repository, "openspec/changes/canonical-e2e");
    await mkdir(path.join(change, "specs/example"), { recursive: true });
    await writeFile(path.join(change, "proposal.md"), `## Why\n\nUsers need deterministic output.\n\n## What Changes\n\n- Add deterministic output.\n\n## Capabilities\n\n### New Capabilities\n- \`example\`: Produce deterministic output.\n\n### Modified Capabilities\n- None.\n\n## Impact\n\n- Test-only fixture.\n`);
    await writeFile(path.join(change, "specs/example/spec.md"), `## ADDED Requirements\n\n### Requirement: Deterministic output\nThe system SHALL produce a stable result for valid input.\n\n#### Scenario: Valid input succeeds\n- **WHEN** a valid input is supplied\n- **THEN** the stable result is returned\n`);
    await writeFile(path.join(change, "design.md"), `## Context\n\nTemporary E2E fixture.\n\n## Goals / Non-Goals\n\n**Goals:**\n- Exercise the canonical transaction.\n\n**Non-Goals:**\n- Ship production code.\n\n## Decisions\n\n### Use repository-local canonical intent\nThe fixture keeps OpenSpec artifacts in the repository.\n\n## Risks / Trade-offs\n\n- Temporary filesystem cost only.\n\n## Migration Plan\n\nNo migration.\n`);
    const qualityManifest = { schema_version: 1, commands: { test: { argv: ["node", "-e", "process.exit(0)"] } } };
    const executionContract = {
      schema_version: 1,
      kind: "team_harness_openspec_execution_contract",
      worktree: { path: repository, branch: "feat/canonical-e2e", base_sha: baseSha },
      quality_manifest: qualityManifest,
      tasks: [{
        source_id: "task:1.1", owner: "implementer", specialist: "implementer", files: ["src/deterministic-output.mjs"],
        dependencies: [], required_invariants: ["I-deterministic-output"], technical_constraints: ["Preserve stable output ordering."],
        quality_command_ids: ["test"], observable_runtime_behavior: false, pre_implementation_test: "not-applicable",
        required_evidence_anchors: ["02-implementation.md"], cross_runtime_preservation: "Preserve deterministic output in every supported runtime.",
        rollback: "Revert the bounded implementation commit.", delivery_group: "default",
        discovery_scope: { directories: ["src"], globs: ["**/*.mjs"] }, required_seams: [],
      }],
    };
    await writeFile(path.join(change, "tasks.md"), `## 1. Fixture\n\n- [ ] 1.1 Produce the deterministic fixture output\n\n## Team Harness Execution Contract\n\n\`\`\`json\n${JSON.stringify(executionContract, null, 2)}\n\`\`\`\n`);
    run(["openspec", "instructions", "proposal", "--change", "canonical-e2e", "--json"], repository);
    run(["openspec", "status", "--change", "canonical-e2e", "--json"], repository);
    run(["openspec", "validate", "canonical-e2e", "--strict", "--json", "--no-interactive"], repository);
    const toolchain = await preflight({ projectRoot: repository, runtime: "codex" });
    assert.equal(toolchain.outcome, "ready");
    const captured = await captureSnapshot({ projectRoot: repository, workspaceRoot: workspace, workspaceMode, changeName: "canonical-e2e", toolchain });
    assert.equal(captured.verdict, "pass");
    const snapshotBytes = await readFile(captured.snapshot_path);
    const snapshot = JSON.parse(snapshotBytes);
    assert.equal(snapshot.workspace.mode, workspaceMode);
    assert.equal(snapshot.workspace.root, workspace);
    assert.equal(snapshot.artifacts.every(artifact => artifact.path.startsWith("openspec/changes/canonical-e2e/")), true);
    assert.equal(await readFile(path.join(repository, "openspec/changes/canonical-e2e/proposal.md"), "utf8").then(Boolean), true);

    const derived = await deriveOpenSpecOverlay({ workspace, writableRoots: [repository, root] });
    assert.equal(derived.verdict, "pass");
    assert.equal(derived.kind, "team_harness_openspec_overlay_derivation");
    assert.equal((await validateOpenSpecOverlay({ workspace, writableRoots: [repository] })).verdict, "pass");

    const coordinates = snapshot.artifacts.flatMap(artifact => artifact.coordinates);
    const requirement = coordinates.find(item => item.kind === "requirement").id;
    const scenarioId = coordinates.find(item => item.kind === "scenario").id;
    const decision = coordinates.find(item => item.kind === "design-decision").id;
    const task = coordinates.find(item => item.kind === "task").id;
    const acceptance = (id, source) => ({ id, sources: [source], classification: "direct", rationale: null, evidence_anchor: "reviews/04-validation.md" });
    const execution = (id, source) => ({
      id, sources: [source], classification: "direct", rationale: null, owner: "implementer", specialist: "implementer",
      shard_path: `plan/tasks/${id}.md`, files: [`src/${id}.mjs`], dependencies: [], required_invariants: ["I-gate-authority"],
      technical_constraints: ["Preserve deterministic output ordering."], quality_command_ids: ["test"], observable_runtime_behavior: false, pre_implementation_test: "not-applicable",
      required_evidence_anchors: ["02-implementation.md"], cross_runtime_preservation: "Preserve equivalent behavior in every supported runtime.",
      rollback: "Revert the task commit.", delivery_group: "default", discovery_scope: { directories: ["src"], globs: ["**/*.mjs"] }, required_seams: [],
    });
    const pairs = [["AC-1", requirement], ["AC-2", scenarioId], ["Task-1", decision], ["Task-2", task]];
    const overlay = {
      schema_version: 2, kind: "team_harness_openspec_execution_overlay", plan_format: "sharded-v1",
      snapshot: { path: "inputs/openspec-snapshot.json", sha256: digest(snapshotBytes), artifact_set_sha256: snapshot.artifact_set_sha256, change_name: "canonical-e2e" },
      repository: { root: repository, ownership: [{ path: "src", owner: "implementer" }], worktree: { path: repository, branch: "feat/canonical-e2e", base_sha: baseSha } }, quality_commands: [{ id: "test" }],
      freeze: { baseline_sha256: "b".repeat(64), state_anchor: "00-state.md", evidence_root: "reviews", quality_manifest_path: ".team-harness/quality.json", quality_manifest_sha256: digest(Buffer.from(`${JSON.stringify(qualityManifest, null, 2)}\n`)) },
      acceptance_items: [acceptance("AC-1", requirement), acceptance("AC-2", scenarioId)],
      execution_items: [execution("Task-1", decision), execution("Task-2", task)],
      source_dispositions: pairs.map(([id, source]) => ({ source_id: source, item_ids: [id], classification: "direct", rationale: null })),
      operator_disclosures: [],
    };
    for (const item of overlay.execution_items) {
      await writeFile(path.join(workspace, item.shard_path), `# ${item.id}\n\n- **Worktree:** ${repository} — branch feat/canonical-e2e, base ${baseSha}\n\n## Dispatch anchors\n\nrequired_invariants: [${item.required_invariants.join(", ")}]\nrequired_evidence_anchors: [${item.required_evidence_anchors.join(", ")}]\ncross_runtime_preservation: ${item.cross_runtime_preservation}\n`);
    }
    await writeFile(path.join(workspace, "plan/openspec-traceability.json"), `${JSON.stringify(overlay)}\n`);
    const gateOneEvidence = await validatePlanContract({
      workspace,
      plan: "01-plan.md",
      snapshot: "inputs/openspec-snapshot.json",
      traceability: "plan/openspec-traceability.json",
      writableRoots: [repository],
    });
    assert.equal(gateOneEvidence.verdict, "pass");
    assert.equal(gateOneEvidence.kind, "team_harness_openspec_overlay_validation");
    assert.equal(await readFile(path.join(workspace, "inputs/openspec-snapshot.json"), "utf8").then(Boolean), true);
    return { generatedSkill: await readFile(path.join(repository, ".agents/skills/openspec-propose/SKILL.md"), "utf8") };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const local = await scenario("local");
assert.match(local.generatedSkill, /author:\s*openspec/);
await scenario("obsidian");
process.stdout.write("OpenSpec Design real E2E: PASS (local + Obsidian workspace roots)\n");
