#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateOpenSpecEvents } from "../skills/pipeline/scripts/openspec-events.mjs";

const failures = [];
const feature = "example-feature";
const checkpoint = { schema_version: 1, kind: "codex_usage_checkpoint", usage_status: "unavailable", reason_code: "CHECKPOINT_UNAVAILABLE", components: null };
const usage = { schema_version: 1, kind: "codex_usage_delta", usage_status: "unavailable", reason_code: "CHECKPOINT_UNAVAILABLE", components: null };

function canonicalEvents() {
  return [
    { ts: "2026-01-01T00:00:00Z", event: "phase.start", feature, phase: "design", agent: "architect", usage_scope: "codex-root-reachable", usage_checkpoint: checkpoint },
    { ts: "2026-01-01T00:00:01Z", event: "agent.spawn", feature, agent_role: "architect", task: "design", observation: "architect started design" },
    { ts: "2026-01-01T00:01:00Z", event: "agent.close", feature, agent_role: "architect", task: "design", status: "success", observation: "architect completed design" },
    { ts: "2026-01-01T00:01:01Z", event: "phase.end", feature, phase: "design", agent: "architect", status: "success", usage, usage_checkpoint: checkpoint },
  ];
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-openspec-events-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  try { await callback({ root, workspace }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function writeJsonl(workspace, events, name = "00-execution-events.jsonl") {
  await writeFile(path.join(workspace, name), `${events.map(event => JSON.stringify(event)).join("\n")}\n`);
}

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

console.log("=== OpenSpec execution events ===");

await check("accepts the complete canonical single-pass Design lifecycle", async () => withFixture(async ({ workspace }) => {
  await writeJsonl(workspace, canonicalEvents());
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
  assert.equal(result.architect_attempt_count, 1);
}));

await check("binds Design evidence to one explicit service", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents().map(event => ({ ...event, service: "transactions" }));
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({
    workspace, events: "00-execution-events.jsonl", feature, service: "transactions",
  });
  assert.equal(result.verdict, "pass");
  assert.equal(result.service, "transactions");
}));

await check("does not borrow another service's Design evidence", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents().map(event => ({ ...event, service: "payments-orchestrator" }));
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({
    workspace, events: "00-execution-events.jsonl", feature, service: "transactions",
  });
  assert.equal(result.verdict, "fail");
  assert.ok(result.warnings.some(item => item.code === "SERVICE_INVALID"));
}));

await check("accepts an observation-only SLA event and legacy optional details", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events.splice(2, 0, {
    ts: "2026-01-01T00:00:30Z", event: "agent.sla", feature,
    observation: "architect still working after the configured SLA; continue waiting",
    elapsed_ms: 600000, live_status: "working", artifact_state: "partial",
  });
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
  assert.equal(result.findings.some(item => item.code === "FOLLOW_UP_COUNT_INVALID"), false);
}));

await check("requires only an observation on diagnostic SLA events", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events.splice(2, 0, { ts: "2026-01-01T00:00:30Z", event: "agent.sla", feature });
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
  assert.ok(result.warnings.some(item => item.code === "OBSERVATION_INVALID"));
}));

await check("accepts durable bounded specialist liveness lease coordinates", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events.splice(2, 0, {
    ts: "2026-01-01T00:00:30Z", event: "agent.sla", feature,
    agent_role: "tester", task: "Task-2",
    observation: "tester exceeded its role SLA; one bounded liveness probe was sent",
    extra: {
      attempt: 1,
      attempt_token: "tester-task-2-attempt-1",
      liveness_action: "probe",
      deadline_at: "2026-01-01T00:02:30Z",
    },
  });
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
  assert.equal(result.warnings.some(item => item.code === "OBSERVATION_INVALID"), false);
}));

await check("treats malformed diagnostic records as warnings when Design evidence is complete", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events.splice(2, 0, "not-json");
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
  assert.ok(result.warnings.some(item => item.code === "EVENT_INVALID"));
  assert.deepEqual(result.findings, []);
}));

await check("accepts an append-only corrected observation after an invalid architect close", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  delete events[2].observation;
  events.splice(3, 0, {
    ts: "2026-01-01T00:01:00.500Z", event: "agent.close", feature,
    agent_role: "architect", task: "design", status: "success",
    observation: "coordinator recorded the successful architect result it directly received",
  });
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
  assert.ok(result.warnings.some(item => item.code === "OBSERVATION_INVALID"));
  assert.equal(result.architect_attempt_count, 1);
}));

await check("still blocks when malformed telemetry leaves no successful architect evidence", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  delete events[2].observation;
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "fail");
  assert.ok(result.warnings.some(item => item.code === "OBSERVATION_INVALID"));
  assert.ok(result.findings.some(item => item.code === "OPENSPEC_DESIGN_ATTEMPTS_INCOMPLETE"));
}));

await check("fails closed on zero architect attempts", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents().filter(event => event.event !== "agent.spawn" && event.event !== "agent.close");
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "fail");
  assert.ok(result.findings.some(item => item.code === "OPENSPEC_DESIGN_ATTEMPTS_INCOMPLETE"));
  assert.equal(result.architect_attempt_count, 0);
}));

await check("accepts one Obsidian jsonl fence", async () => withFixture(async ({ workspace }) => {
  const body = canonicalEvents().map(event => JSON.stringify(event)).join("\n");
  await writeFile(path.join(workspace, "00-execution-events.md"), `# Events\n\n\`\`\`jsonl\n${body}\n\`\`\`\n`);
  assert.equal((await validateOpenSpecEvents({ workspace, events: "00-execution-events.md", feature })).verdict, "pass");
}));

await check("accepts append-only Obsidian continuation fences", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  const first = events.slice(0, 2).map(event => JSON.stringify(event)).join("\n");
  const second = events.slice(2).map(event => JSON.stringify(event)).join("\n");
  await writeFile(path.join(workspace, "00-execution-events.md"),
    `# Events\n\n\`\`\`jsonl\n${first}\n\`\`\`\n\n## Continuation\n\n\`\`\`jsonl\n${second}\n\`\`\`\n`);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.md", feature });
  assert.equal(result.verdict, "pass");
  assert.equal(result.event_count, 4);
}));

await check("round-trips free-form observations as one JSONL line inside an Obsidian fence", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  const observation = 'architect returned "two findings"\nkeep ``` literal\tand \\ paths';
  events[2].observation = observation;
  const lines = events.map(event => JSON.stringify(event));
  assert.equal(lines.length, events.length);
  assert.equal(lines.some(line => line === "```"), false);
  assert.equal(JSON.parse(lines[2]).observation, observation);
  await writeFile(path.join(workspace, "00-execution-events.md"),
    `# Events\n\n\`\`\`jsonl\n${lines.join("\n")}\n\`\`\`\n`);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.md", feature });
  assert.equal(result.verdict, "pass");
  assert.equal(result.event_count, events.length);
}));

await check("warns on malformed records and excludes them from required evidence", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  delete events[0].ts;
  delete events[1].feature;
  events[1].task = "openspec-planning";
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "fail");
  assert.ok(result.warnings.some(item => item.code === "TIMESTAMP_INVALID"));
  assert.ok(result.warnings.some(item => item.code === "FEATURE_INVALID"));
  assert.ok(result.warnings.some(item => item.code === "AGENT_TASK_INVALID"));
  assert.ok(result.findings.some(item => item.code === "DESIGN_PHASE_UNBALANCED"));
  assert.ok(result.findings.some(item => item.code === "OPENSPEC_DESIGN_ATTEMPTS_INCOMPLETE"));
}));

await check("warns on an invalid close status and blocks only for missing success evidence", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events[2].status = "complete";
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.ok(result.warnings.some(item => item.code === "STATUS_INVALID"));
  assert.ok(result.findings.some(item => item.code === "OPENSPEC_DESIGN_ATTEMPTS_INCOMPLETE"));
}));

await check("maps unexpected filesystem failures to a closed non-disclosing error", async () => withFixture(async ({ workspace }) => {
  const result = await validateOpenSpecEvents({ workspace, events: "missing-events.jsonl", feature });
  assert.equal(result.verdict, "fail");
  assert.equal(result.error_code, "INTERNAL_ERROR");
  assert.deepEqual(result.findings, [{ code: "INTERNAL_ERROR", line: null }]);
  assert.equal(JSON.stringify(result).includes(workspace), false);
}));

if (failures.length > 0) {
  console.error(`${failures.length} OpenSpec event checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
