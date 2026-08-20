#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateOpenSpecEvents } from "../skills/pipeline/scripts/openspec-events.mjs";

const failures = [];
const feature = "example-feature";
const metrics = { schema_version: 1, kind: "codex_agent_attempt_metrics", metrics_status: "unavailable", reason_code: "PER_ATTEMPT_METRICS_UNAVAILABLE", components: null };
const checkpoint = { schema_version: 1, kind: "codex_usage_checkpoint", usage_status: "unavailable", reason_code: "CHECKPOINT_UNAVAILABLE", components: null };
const usage = { schema_version: 1, kind: "codex_usage_delta", usage_status: "unavailable", reason_code: "CHECKPOINT_UNAVAILABLE", components: null };

function canonicalEvents() {
  return [
    { ts: "2026-01-01T00:00:00Z", event: "phase.start", feature, phase: "design", agent: "architect", usage_scope: "codex-root-reachable", usage_checkpoint: checkpoint },
    { ts: "2026-01-01T00:00:01Z", event: "agent.spawn", feature, agent_role: "architect", task: "design", attempt_ordinal: 1, context_strategy: "fresh", follow_up_count: 0 },
    { ts: "2026-01-01T00:01:00Z", event: "agent.close", feature, agent_role: "architect", task: "design", attempt_ordinal: 1, context_strategy: "fresh", follow_up_count: 0, status: "success", quality_verdict: "n-a", attempt_metrics: metrics, wall_time_ms: 59000, declared_input_bytes: 16384 },
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

await check("rejects missing universal fields and dispatch modes used as task names", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  delete events[0].ts;
  delete events[1].feature;
  events[1].task = "openspec-planning";
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.ok(result.findings.some(item => item.code === "TIMESTAMP_INVALID"));
  assert.ok(result.findings.some(item => item.code === "FEATURE_INVALID"));
  assert.ok(result.findings.some(item => item.code === "AGENT_TASK_INVALID"));
}));

await check("rejects complete status, missing attempt metrics, and an open attempt", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events[2].status = "complete";
  delete events[2].attempt_metrics;
  events.splice(-1, 0, { ts: "2026-01-01T00:01:02Z", event: "agent.spawn", feature, agent_role: "architect", task: "design", attempt_ordinal: 2, context_strategy: "fresh", follow_up_count: 0 });
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.ok(result.findings.some(item => item.code === "STATUS_INVALID"));
  assert.ok(result.findings.some(item => item.code === "ATTEMPT_METRICS_INVALID"));
  assert.ok(result.findings.some(item => item.code === "ATTEMPT_UNCLOSED"));
}));

await check("maps unexpected filesystem failures to a closed non-disclosing error", async () => withFixture(async ({ workspace }) => {
  const result = await validateOpenSpecEvents({ workspace, events: "missing-events.jsonl", feature });
  assert.equal(result.verdict, "fail");
  assert.equal(result.error_code, "INTERNAL_ERROR");
  assert.deepEqual(result.findings, [{ code: "INTERNAL_ERROR", line: null }]);
  assert.equal(JSON.stringify(result).includes(workspace), false);
}));

await check("rejects an attempt that discards every derivable measure", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  const close = events.find(event => event.event === "agent.close");
  delete close.wall_time_ms;
  delete close.declared_input_bytes;
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "fail");
  assert.ok(result.findings.some(item => item.code === "DERIVED_MEASURES_MISSING"));
}));

await check("accepts wall time alone when no input manifest was declared", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  const close = events.find(event => event.event === "agent.close");
  delete close.declared_input_bytes;
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.equal(result.verdict, "pass");
}));

await check("rejects a negative or fractional derivable measure", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events.find(event => event.event === "agent.close").wall_time_ms = -1;
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.ok(result.findings.some(item => item.code === "DERIVED_MEASURES_MISSING"));
}));

await check("keeps the unavailable token branch as the only alternative to a complete set", async () => withFixture(async ({ workspace }) => {
  const events = canonicalEvents();
  events.find(event => event.event === "agent.close").attempt_metrics = {
    schema_version: 1, kind: "codex_agent_attempt_metrics", metrics_status: "available", reason_code: null,
    components: { cached_input_tokens: 1, uncached_input_tokens: 2, output_tokens: 3 },
  };
  await writeJsonl(workspace, events);
  const result = await validateOpenSpecEvents({ workspace, events: "00-execution-events.jsonl", feature });
  assert.ok(result.findings.some(item => item.code === "ATTEMPT_METRICS_INVALID"));
}));

if (failures.length > 0) {
  console.error(`${failures.length} OpenSpec event checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
