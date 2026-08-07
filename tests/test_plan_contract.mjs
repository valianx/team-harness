#!/usr/bin/env node
/** Behavioral coverage for the deterministic functional-first plan contract. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPlanContractResult,
  validatePlanContract,
} from "../plugins/team-harness/skills/pipeline/scripts/plan-contract.mjs";
import {
  isPlanContractRepairResult,
  repairPlanContract,
} from "../plugins/team-harness/skills/pipeline/scripts/plan-contract-repair.mjs";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const runner = path.resolve(testsDirectory, "../plugins/team-harness/skills/pipeline/scripts/plan-contract.mjs");
const failures = [];

async function check(name, callback) {
  try {
    await callback();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  [FAIL] ${name}: ${error instanceof Error ? error.message : "unexpected failure"}`);
  }
}

function planText(overrides = "") {
  return `# Plan: checkout retry
**Date:** 2026-08-05
**Agent:** architect
**Plan format:** sharded-v1
**Reviews:** pending

## Review Summary

**Tasks:** 1 | **Services:** checkout | **Estimated complexity:** standard

### Problem and Observable Outcome
- Problem: Operators cannot distinguish a retryable checkout interruption from a final failure.
- Observable outcome: An interrupted checkout clearly reports whether retry remains available.

### Actors and Flows
- Actor: checkout operator → retries an interrupted payment → observes either completion or a stable terminal error.

### Business Rules and Examples
- Rule: Only retryable interruptions offer another attempt.
- Example: Given a retryable interruption, when the operator retries, then checkout resumes once.

### Alternate and Error Behavior
- A terminal payment rejection remains terminal and offers no retry.

### Unchanged Behavior
- Successful checkout and existing terminal rejection messages remain unchanged.

### Non-Goals
- Changing payment-provider selection is excluded.

### Decisions for human review
- No human-judgement decisions required — the functional contract follows the approved request. → decided

### Confidence Score
**Confidence:** 8/10 (single-pass)
- Spec clarity: retryable and terminal outcomes are explicit.

### Scope Shape
- request_shape: adaptation
- realized_scope: aligned

### Classification block
- touches_http_api: false
- touches_ui: true
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false
- spans_multiple_services: false
- changes_security_control: false
${overrides}
## Plan Manifest

| Kind | ID | Path | Anchors |
|------|----|------|---------|
| architecture | shared | \`plan/architecture.md\` | decisions, services, assessments, work-plan |
| delivery | shared | \`plan/delivery.md\` | grouping, dependencies, base, version |
| task | Task-1 | \`plan/tasks/Task-1.md\` | AC-1 |

### Task Index

| Task | Service | Status | AC count | TC count | Path |
|------|---------|--------|----------|----------|------|
| Task-1 | checkout | pending | 1 | 1 | \`plan/tasks/Task-1.md\` |
`;
}

const architecture = `# Architecture

### Documentation Consulted
No third-party libraries verified — this change is pure repository code.

### Current State
Checkout interruptions share one terminal presentation.

### Key Decisions
Keep retry classification at the existing boundary.

### Proposed Approach
Separate retryable presentation from terminal rejection using the established result type.

### Patterns to Mirror
- \`src/checkout/result.ts:12\` — supported result classification.

### Engineering Risks and Trade-offs
| Concern | Severity | Disposition |
|---------|----------|-------------|
| Duplicate retry | medium | preserve the existing idempotency boundary |

### Services Touched
- checkout

### Security Assessment
| Risk | Severity | Mitigation |
|------|----------|------------|
| none | low | preserve existing authorization |

### Performance Assessment
| Concern | Impact | Mitigation |
|---------|--------|------------|
| none | low | no additional remote call |

### Work Plan
| # | Step | Files | Action | Depends on |
|---|------|-------|--------|------------|
| 1 | expose retry state | src/checkout/result.ts | preserve the supported outcome | — |
`;

const delivery = `# Delivery

### Summary
| Task | Service | Files | AC count | TC count | Depends on |
|------|---------|-------|----------|----------|------------|
| Task-1 | checkout | 1 | 1 | 1 | none |

### Delivery Grouping
Grouping: all-tasks-one-pr
`;

function taskText({ ac = "- [ ] **AC-1**: Given a retryable interruption, When the operator retries, Then checkout resumes once.", tc = "- **TC-1**: Preserve the current idempotency boundary.", pretest = "- **Pre-implementation test:** not-applicable — repository manifest has no test_contract" } = {}) {
  return `# Task-1: expose retry state

- **Service:** checkout
- **Files:**
  - \`src/checkout/result.ts\` (modify)
- **Depends on:** none

#### Acceptance Criteria

${ac}

#### Technical Constraints

${tc}

#### Verification

${pretest}
- Exercise retryable and terminal checkout outcomes.
`;
}

async function fixture({ plan = planText(), task = taskText() } = {}) {
  const workspace = await mkdtemp(path.join(tmpdir(), "th-functional-plan-"));
  await mkdir(path.join(workspace, "plan/tasks"), { recursive: true });
  await writeFile(path.join(workspace, "01-plan.md"), plan);
  await writeFile(path.join(workspace, "plan/architecture.md"), architecture);
  await writeFile(path.join(workspace, "plan/delivery.md"), delivery);
  await writeFile(path.join(workspace, "plan/tasks/Task-1.md"), task);
  return workspace;
}

async function run(workspace) {
  return validatePlanContract({ workspace, plan: "01-plan.md" });
}

console.log("=== Deterministic functional-first plan contract ===");

await check("a complete functional contract and technical shard set produce closed evidence", async () => {
  const workspace = await fixture();
  try {
    const result = await run(workspace);
    assert.equal(result.verdict, "pass", JSON.stringify(result));
    assert.equal(result.error_code, null);
    assert.equal(result.functional.decision_count, 1);
    assert.equal(result.tasks[0].actual_ac_count, 1);
    assert.equal(result.tasks[0].actual_tc_count, 1);
    assert.equal(result.artifacts.length, 4);
    assert.match(result.artifact_set_sha256, /^[0-9a-f]{64}$/);
    assert.equal(isPlanContractResult(result), true);
    assert.equal(isPlanContractResult({
      ...result,
      plan: { ...result.plan, unexpected: true },
    }), false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("the CLI emits the same closed contract and useful exit status", async () => {
  const workspace = await fixture();
  try {
    const output = execFileSync(process.execPath, [runner, "--workspace", workspace, "--plan", "01-plan.md"], { encoding: "utf8" });
    const result = JSON.parse(output);
    assert.equal(result.verdict, "pass");
    assert.equal(isPlanContractResult(result), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("missing, empty, or out-of-order functional sections fail closed", async () => {
  for (const plan of [
    planText().replace("### Actors and Flows", "### Missing Actors"),
    planText().replace("- Rule: Only retryable interruptions offer another attempt.", ""),
    planText().replace("### Actors and Flows", "### TEMP").replace("### Business Rules and Examples", "### Actors and Flows").replace("### TEMP", "### Business Rules and Examples"),
  ]) {
    const workspace = await fixture({ plan });
    try {
      const result = await run(workspace);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "FUNCTIONAL_CONTRACT_INVALID");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
});

await check("genuinely empty actor and rule lists accept the documented None form", async () => {
  const plan = planText()
    .replace(
      "- Actor: checkout operator → retries an interrupted payment → observes either completion or a stable terminal error.",
      "- None — no actor flow changes are required.",
    )
    .replace(
      "- Rule: Only retryable interruptions offer another attempt.\n- Example: Given a retryable interruption, when the operator retries, then checkout resumes once.",
      "- None — no business rule changes are required.",
    );
  const workspace = await fixture({ plan });
  try {
    const result = await run(workspace);
    assert.equal(result.verdict, "pass", JSON.stringify(result));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("implementation detail cannot leak back into the functional contract", async () => {
  for (const insertion of [
    "\n### Proposed Approach\nUse a state enum.\n",
    "\n- Mirror \`src/checkout/result.ts:12\`.\n",
    "\n```js\nconst retry = true;\n```\n",
  ]) {
    const workspace = await fixture({ plan: planText(insertion) });
    try {
      const result = await run(workspace);
      assert.equal(result.verdict, "fail");
      assert(result.findings.some((entry) => entry.code === "FUNCTIONAL_TECHNICAL_LEAKAGE"));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
});

await check("task AC, TC, pre-test, and index counts are verified rather than trusted", async () => {
  const invalidTasks = [
    taskText({ ac: "- [ ] **AC-1**: Update the private result enum." }),
    taskText({ tc: "- **TC-1**: first\n- **TC-1**: duplicate" }),
    taskText({ pretest: "- Run tests later." }),
  ];
  for (const task of invalidTasks) {
    const workspace = await fixture({ task });
    try {
      const result = await run(workspace);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "TASK_INVALID");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
});

await check("technical approach and patterns remain required in architecture", async () => {
  const workspace = await fixture();
  try {
    await writeFile(path.join(workspace, "plan/architecture.md"), architecture.replace("### Patterns to Mirror", "### Missing Patterns"));
    const result = await run(workspace);
    assert.equal(result.verdict, "fail");
    assert(result.findings.some((entry) => entry.code === "ARCHITECTURE_SECTION_MISSING"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("every manifest task is represented exactly once in the task index", async () => {
  const extraManifestRow = "| task | Task-2 | `plan/tasks/Task-2.md` | AC-1 |\n";
  const workspace = await fixture({
    plan: planText().replace("### Task Index", `${extraManifestRow}\n### Task Index`),
  });
  try {
    await writeFile(path.join(workspace, "plan/tasks/Task-2.md"), taskText().replaceAll("Task-1", "Task-2"));
    const result = await run(workspace);
    assert.equal(result.verdict, "fail");
    assert(result.findings.some((entry) => entry.code === "TASK_INDEX_INVALID" && entry.section === "Task Index coverage"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("missing task routes are repaired once without another architect pass", async () => {
  const taskRows = [1, 2, 3, 4]
    .map((id) => `| Task-${id} | checkout | pending | 1 | 1 | \`plan/tasks/Task-${id}.md\` |`)
    .join("\n");
  const plan = planText()
    .replace("| task | Task-1 | `plan/tasks/Task-1.md` | AC-1 |\n", "")
    .replace("| Task-1 | checkout | pending | 1 | 1 | `plan/tasks/Task-1.md` |", taskRows);
  const workspace = await fixture({ plan });
  try {
    for (const id of [2, 3, 4]) {
      await writeFile(
        path.join(workspace, `plan/tasks/Task-${id}.md`),
        taskText().replaceAll("Task-1", `Task-${id}`),
      );
    }
    const before = await readFile(path.join(workspace, "01-plan.md"));
    const first = await repairPlanContract({ workspace, plan: "01-plan.md" });
    assert.equal(first.verdict, "repaired", JSON.stringify(first));
    assert.equal(isPlanContractRepairResult(first), true);
    assert.deepEqual(first.added_paths, [
      "plan/tasks/Task-1.md",
      "plan/tasks/Task-2.md",
      "plan/tasks/Task-3.md",
      "plan/tasks/Task-4.md",
    ]);
    assert.equal(first.contract_verdict, "pass", JSON.stringify(first));
    assert.notEqual(first.before_sha256, first.after_sha256);
    const repaired = await readFile(path.join(workspace, "01-plan.md"));
    assert.notDeepEqual(repaired, before);
    for (const route of first.added_paths) assert(repaired.toString("utf8").includes("`" + route + "`"));

    const second = await repairPlanContract({ workspace, plan: "01-plan.md" });
    assert.equal(second.verdict, "not-needed", JSON.stringify(second));
    assert.equal(isPlanContractRepairResult(second), true);
    assert.deepEqual(second.added_paths, []);
    assert.deepEqual(await readFile(path.join(workspace, "01-plan.md")), repaired);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("mechanical repair fails closed for semantic index defects", async () => {
  const plan = planText()
    .replace("| task | Task-1 | `plan/tasks/Task-1.md` | AC-1 |\n", "")
    .replace("| Task-1 | checkout | pending | 1 | 1 |", "| Task-1 | checkout | pending | invalid | 1 |");
  const workspace = await fixture({ plan });
  try {
    const before = await readFile(path.join(workspace, "01-plan.md"));
    const repair = await repairPlanContract({ workspace, plan: "01-plan.md" });
    assert.equal(repair.verdict, "blocked", JSON.stringify(repair));
    assert.equal(isPlanContractRepairResult(repair), true);
    assert.equal(repair.reason, "task-index-semantic-or-format-defect");
    assert.deepEqual(await readFile(path.join(workspace, "01-plan.md")), before);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("duplicated or misplaced task indexes are never repaired", async () => {
  const strayIndex = `### Task Index

| Task | Service | Status | AC count | TC count | Path |
|------|---------|--------|----------|----------|------|
| Task-1 | checkout | pending | 1 | 1 | \`plan/tasks/Task-1.md\` |

`;
  const plan = planText()
    .replace("| task | Task-1 | `plan/tasks/Task-1.md` | AC-1 |\n", "")
    .replace("## Plan Manifest", `${strayIndex}## Plan Manifest`);
  const workspace = await fixture({ plan });
  try {
    const before = await readFile(path.join(workspace, "01-plan.md"));
    const validation = await run(workspace);
    assert.equal(validation.verdict, "fail", JSON.stringify(validation));
    assert(validation.findings.some((entry) =>
      entry.code === "TASK_INDEX_INVALID" && entry.section === "Plan Manifest/Task Index"));
    const repair = await repairPlanContract({ workspace, plan: "01-plan.md" });
    assert.equal(repair.verdict, "blocked", JSON.stringify(repair));
    assert.equal(repair.reason, "manifest-or-index-missing");
    assert.equal(isPlanContractRepairResult(repair), true);
    assert.deepEqual(await readFile(path.join(workspace, "01-plan.md")), before);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("mechanical repair never manufactures a missing task shard", async () => {
  const plan = planText().replace("| task | Task-1 | `plan/tasks/Task-1.md` | AC-1 |\n", "");
  const workspace = await fixture({ plan });
  try {
    await rm(path.join(workspace, "plan/tasks/Task-1.md"));
    const before = await readFile(path.join(workspace, "01-plan.md"));
    const repair = await repairPlanContract({ workspace, plan: "01-plan.md" });
    assert.equal(repair.verdict, "blocked", JSON.stringify(repair));
    assert.equal(isPlanContractRepairResult(repair), true);
    assert.deepEqual(await readFile(path.join(workspace, "01-plan.md")), before);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("task rows without a trailing pipe preserve the complete shard path", async () => {
  const plan = planText().replace(
    "| Task-1 | checkout | pending | 1 | 1 | `plan/tasks/Task-1.md` |",
    "| Task-1 | checkout | pending | 1 | 1 | `plan/tasks/Task-1.md`",
  );
  const workspace = await fixture({ plan });
  try {
    const result = await run(workspace);
    assert.equal(result.verdict, "pass", JSON.stringify(result));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("malformed task rows retain TASK_INDEX_INVALID diagnostics", async () => {
  const plan = planText().replace(
    "| Task-1 | checkout | pending | 1 | 1 | `plan/tasks/Task-1.md` |",
    "| Task-1 | checkout | pending | invalid | 1 | `plan/tasks/not-canonical.md` |",
  );
  const workspace = await fixture({ plan });
  try {
    const result = await run(workspace);
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "TASK_INDEX_INVALID");
    assert(result.findings.some((entry) => entry.code === "TASK_INDEX_INVALID" && entry.section === "Task-1"));
    assert.notEqual(result.error_code, "INTERNAL_ERROR");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("manifest traversal, missing artifacts, and symlinks fail closed", async () => {
  const workspace = await fixture();
  const externalRoot = await mkdtemp(path.join(tmpdir(), "th-plan-external-"));
  try {
    const external = path.join(externalRoot, "architecture.md");
    await writeFile(external, architecture);
    await rm(path.join(workspace, "plan/architecture.md"));
    try {
      await symlink(external, path.join(workspace, "plan/architecture.md"));
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) return;
      throw error;
    }
    const result = await run(workspace);
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "MANIFEST_INVALID");
  } finally {
    await rm(externalRoot, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

await check("legacy plans are rejected by the new-plan validator without being rewritten", async () => {
  const workspace = await fixture({ plan: planText().replace("**Plan format:** sharded-v1", "**Plan format:** monolith-v1") });
  try {
    const before = await readFile(path.join(workspace, "01-plan.md"));
    const result = await run(workspace);
    assert.equal(result.verdict, "fail");
    assert.deepEqual(await readFile(path.join(workspace, "01-plan.md")), before);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} functional plan contract check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll functional-first plan contract checks passed.");
}
