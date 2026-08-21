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
const MAX_WARNINGS = 128;
const FEATURE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const STATUS = new Set(["success", "failed", "blocked", "skipped"]);
const ERROR_CODES = new Set([
  "ARGUMENT_INVALID", "EVENTS_FENCE_INVALID", "EVENTS_FILE_INVALID", "EVENT_COUNT_INVALID",
]);
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

function extractLines(text, markdown) {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!markdown) return normalized.split("\n").filter((line) => line.trim().length > 0);
  const blocks = [...normalized.matchAll(/^```jsonl\s*$\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length === 0) throw new Error("EVENTS_FENCE_INVALID");
  return blocks.flatMap((block) => block[1].split("\n").filter((line) => line.trim().length > 0));
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

function validateAgentEvent(event, line, warnings) {
  let valid = true;
  const hasObservation = typeof event.observation === "string" && event.observation.trim().length > 0;
  const legacyLifecycle = Object.hasOwn(event, "attempt_ordinal") ||
    Object.hasOwn(event, "context_strategy") || Object.hasOwn(event, "follow_up_count");
  if (!hasObservation && !legacyLifecycle) {
    warnings.push(finding("OBSERVATION_INVALID", line));
    valid = false;
  }
  if (event.event === "agent.sla") return valid;
  if (event.agent_role === "architect" && event.task !== "design") {
    warnings.push(finding("AGENT_TASK_INVALID", line));
    valid = false;
  }
  if (event.event === "agent.close" && !STATUS.has(event.status)) {
    warnings.push(finding("STATUS_INVALID", line));
    valid = false;
  }
  return valid;
}

export async function validateOpenSpecEvents({ workspace, events, feature } = {}) {
  const started = process.hrtime.bigint();
  const findings = [];
  const warnings = [];
  let eventCount = 0;
  let architectAttempts = 0;
  let successfulArchitectAttempts = 0;
  let designStarts = 0;
  let designEnds = 0;
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
      catch { warnings.push(finding("JSON_INVALID", line)); continue; }
      if (!object(event)) { warnings.push(finding("EVENT_INVALID", line)); continue; }
      let validEnvelope = true;
      if (!validTimestamp(event.ts)) {
        warnings.push(finding("TIMESTAMP_INVALID", line));
        validEnvelope = false;
      }
      if (event.feature !== feature) {
        warnings.push(finding("FEATURE_INVALID", line));
        validEnvelope = false;
      }
      if (typeof event.event !== "string" || event.event.length === 0) {
        warnings.push(finding("EVENT_NAME_INVALID", line));
        continue;
      }
      if (event.event === "phase.start" || event.event === "phase.end") {
        let validPhase = validEnvelope;
        if (typeof event.phase !== "string" || !ROLE_TASK.has(event.agent) ||
          (event.phase === "design" && event.agent !== "architect")) {
          warnings.push(finding("PHASE_IDENTITY_INVALID", line));
          validPhase = false;
        }
        if (event.event === "phase.end" && !STATUS.has(event.status)) {
          warnings.push(finding("STATUS_INVALID", line));
          validPhase = false;
        }
        if (validPhase && event.phase === "design") {
          if (event.event === "phase.start") designStarts += 1;
          else if (event.status === "success") designEnds += 1;
        }
      }
      if (["agent.spawn", "agent.sla", "agent.close", "agent.correction.spawn"].includes(event.event)) {
        const validAgent = validateAgentEvent(event, line, warnings) && validEnvelope;
        if (validAgent && event.agent_role === "architect" && event.task === "design" &&
          (event.event === "agent.spawn" || event.event === "agent.correction.spawn")) architectAttempts += 1;
        if (validAgent && event.agent_role === "architect" && event.task === "design" && event.event === "agent.close" && event.status === "success") {
          successfulArchitectAttempts += 1;
        }
      }
    }
    if (designStarts === 0 || designEnds === 0) findings.push(finding("DESIGN_PHASE_UNBALANCED"));
    if (architectAttempts < 1 || successfulArchitectAttempts < 1) findings.push(finding("OPENSPEC_DESIGN_ATTEMPTS_INCOMPLETE"));
  } catch (error) {
    const code = typeof error?.message === "string" && ERROR_CODES.has(error.message)
      ? error.message
      : "INTERNAL_ERROR";
    findings.push(finding(code));
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
    design_phase_pairs: Math.min(designStarts, designEnds),
    architect_attempt_count: architectAttempts,
    findings: bounded,
    warnings: warnings.slice(0, MAX_WARNINGS),
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
