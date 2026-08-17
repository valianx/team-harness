#!/usr/bin/env node
/** Validate the durable OpenSpec design trace before Team Harness Gate 1. */

import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const OPENSPEC_EVENTS_SCHEMA_VERSION = 1;

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 4096;
const MAX_FINDINGS = 128;
const FEATURE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const STATUS = new Set(["success", "failed", "blocked", "skipped"]);
const QUALITY = new Set(["pass", "concerns", "fail", "n-a"]);
const CONTEXT = new Set(["fresh", "continued"]);
const ROLE_TASK = new Map([
  ["architect", "design"],
  ["implementer", "implementation"],
  ["tester", "test_evidence"],
  ["qa", "quality_review"],
  ["security", "security_review"],
  ["delivery", "delivery"],
]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\u0000")) return false;
  const normalized = value.replaceAll("\\", "/");
  return Buffer.byteLength(normalized, "utf8") <= 512 &&
    !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

function contained(root, target) {
  const child = path.relative(root, target);
  return child === "" || (child !== ".." && !child.startsWith(`..${path.sep}`) && !path.isAbsolute(child));
}

function finding(code, line = null) {
  return { code, line };
}

function validTimestamp(value) {
  return typeof value === "string" && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

function validAttemptMetrics(value) {
  if (!object(value) || value.schema_version !== 1 || value.kind !== "codex_agent_attempt_metrics") return false;
  if (value.metrics_status === "unavailable") {
    return value.reason_code === "PER_ATTEMPT_METRICS_UNAVAILABLE" && value.components === null;
  }
  if (value.metrics_status !== "available" || value.reason_code !== null || !object(value.components)) return false;
  const keys = ["cached_input_tokens", "uncached_input_tokens", "output_tokens", "wall_time_ms", "tool_calls"];
  return Object.keys(value.components).length === keys.length && keys.every((key) =>
    Object.hasOwn(value.components, key) && Number.isSafeInteger(value.components[key]) && value.components[key] >= 0);
}

function extractLines(text, markdown) {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!markdown) return normalized.split("\n").filter((line) => line.trim().length > 0);
  const blocks = [...normalized.matchAll(/^```jsonl\s*$\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error("EVENTS_FENCE_INVALID");
  return blocks[0][1].split("\n").filter((line) => line.trim().length > 0);
}

async function readEvents(workspace, relative) {
  if (!safeRelative(relative)) throw new Error("ARGUMENT_INVALID");
  const requested = path.resolve(workspace, relative);
  const stat = await lstat(requested);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("EVENTS_FILE_INVALID");
  const canonical = await realpath(requested);
  if (!contained(workspace, canonical)) throw new Error("EVENTS_FILE_INVALID");
  const bytes = await readFile(canonical);
  if (bytes.length > MAX_BYTES) throw new Error("EVENTS_FILE_INVALID");
  return extractLines(bytes.toString("utf8"), relative.endsWith(".md"));
}

function validateLifecycle(event, line, open, findings) {
  const expectedTask = ROLE_TASK.get(event.agent_role);
  if (!expectedTask || event.task !== expectedTask) findings.push(finding("AGENT_TASK_INVALID", line));
  if (!Number.isSafeInteger(event.attempt_ordinal) || event.attempt_ordinal < 1) findings.push(finding("ATTEMPT_ORDINAL_INVALID", line));
  if (!Number.isSafeInteger(event.follow_up_count) || event.follow_up_count < 0) findings.push(finding("FOLLOW_UP_COUNT_INVALID", line));
  const key = `${event.agent_role}:${event.task}:${event.attempt_ordinal}`;
  if (event.event === "agent.spawn" || event.event === "agent.correction.spawn") {
    if (!CONTEXT.has(event.context_strategy)) findings.push(finding("CONTEXT_STRATEGY_INVALID", line));
    if (event.event === "agent.spawn" && event.context_strategy === "fresh" && event.follow_up_count !== 0) {
      findings.push(finding("FOLLOW_UP_COUNT_INVALID", line));
    }
    if (event.event === "agent.correction.spawn" &&
      (event.context_strategy !== "fresh" || event.follow_up_count !== 0 || event.correction_cause !== "verification")) {
      findings.push(finding("CORRECTION_SPAWN_INVALID", line));
    }
    if (open.has(key)) findings.push(finding("ATTEMPT_ALREADY_OPEN", line));
    else open.set(key, line);
    return;
  }
  if (event.event === "agent.sla") {
    if (!open.has(key)) findings.push(finding("SLA_WITHOUT_OPEN_ATTEMPT", line));
    return;
  }
  if (!open.has(key)) findings.push(finding("CLOSE_WITHOUT_OPEN_ATTEMPT", line));
  else open.delete(key);
  if (!CONTEXT.has(event.context_strategy)) findings.push(finding("CONTEXT_STRATEGY_INVALID", line));
  if (!STATUS.has(event.status)) findings.push(finding("STATUS_INVALID", line));
  if (!QUALITY.has(event.quality_verdict)) findings.push(finding("QUALITY_VERDICT_INVALID", line));
  if (!validAttemptMetrics(event.attempt_metrics)) findings.push(finding("ATTEMPT_METRICS_INVALID", line));
}

export async function validateOpenSpecEvents({ workspace, events, feature } = {}) {
  const started = process.hrtime.bigint();
  const findings = [];
  let eventCount = 0;
  let architectAttempts = 0;
  let successfulArchitectAttempts = 0;
  let designStarts = 0;
  let designEnds = 0;
  const open = new Map();
  try {
    if (typeof workspace !== "string" || !path.isAbsolute(workspace) || !safeRelative(events) || !FEATURE.test(feature ?? "")) {
      throw new Error("ARGUMENT_INVALID");
    }
    const root = await realpath(path.resolve(workspace));
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("ARGUMENT_INVALID");
    const lines = await readEvents(root, events);
    if (lines.length === 0 || lines.length > MAX_EVENTS) throw new Error("EVENT_COUNT_INVALID");
    eventCount = lines.length;
    for (const [index, text] of lines.entries()) {
      const line = index + 1;
      let event;
      try { event = JSON.parse(text); }
      catch { findings.push(finding("JSON_INVALID", line)); continue; }
      if (!object(event)) { findings.push(finding("EVENT_INVALID", line)); continue; }
      if (!validTimestamp(event.ts)) findings.push(finding("TIMESTAMP_INVALID", line));
      if (event.feature !== feature) findings.push(finding("FEATURE_INVALID", line));
      if (typeof event.event !== "string" || event.event.length === 0) {
        findings.push(finding("EVENT_NAME_INVALID", line));
        continue;
      }
      if (event.event === "phase.start" || event.event === "phase.end") {
        if (typeof event.phase !== "string" || !ROLE_TASK.has(event.agent)) findings.push(finding("PHASE_IDENTITY_INVALID", line));
        if (event.phase === "design") {
          if (event.agent !== "architect") findings.push(finding("PHASE_IDENTITY_INVALID", line));
          if (event.event === "phase.start") designStarts += 1;
          else {
            designEnds += 1;
            if (!STATUS.has(event.status)) findings.push(finding("STATUS_INVALID", line));
          }
        }
      }
      if (["agent.spawn", "agent.sla", "agent.close", "agent.correction.spawn"].includes(event.event)) {
        validateLifecycle(event, line, open, findings);
        if (event.agent_role === "architect" && event.task === "design" &&
          (event.event === "agent.spawn" || event.event === "agent.correction.spawn")) architectAttempts += 1;
        if (event.agent_role === "architect" && event.task === "design" && event.event === "agent.close" && event.status === "success") {
          successfulArchitectAttempts += 1;
        }
      }
    }
    if (designStarts === 0 || designStarts !== designEnds) findings.push(finding("DESIGN_PHASE_UNBALANCED"));
    if (open.size > 0) findings.push(finding("ATTEMPT_UNCLOSED"));
    if (architectAttempts < 2 || successfulArchitectAttempts < 2) findings.push(finding("OPENSPEC_DESIGN_ATTEMPTS_INCOMPLETE"));
  } catch (error) {
    findings.push(finding(error?.message ?? "INTERNAL_ERROR"));
  }
  const bounded = findings.slice(0, MAX_FINDINGS);
  return {
    schema_version: OPENSPEC_EVENTS_SCHEMA_VERSION,
    kind: "team_harness_openspec_execution_events_validation",
    verdict: bounded.length === 0 ? "pass" : "fail",
    error_code: bounded.length === 0 ? null : bounded[0].code,
    duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
    feature: FEATURE.test(feature ?? "") ? feature : null,
    event_count: eventCount,
    design_phase_pairs: designEnds,
    architect_attempt_count: architectAttempts,
    findings: bounded,
  };
}

function parseCli(argv) {
  if (argv.length !== 6) return null;
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = ({ "--workspace": "workspace", "--events": "events", "--feature": "feature" })[argv[index]];
    if (!key || Object.hasOwn(result, key) || !argv[index + 1]) return null;
    result[key] = argv[index + 1];
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await validateOpenSpecEvents(parseCli(process.argv.slice(2)) ?? {});
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
