#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  evaluateSpecialistLiveness,
  SPECIALIST_LIVENESS_GRACE_MS,
} from "../skills/pipeline/scripts/specialist-liveness.mjs";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const helper = resolve(repositoryRoot, "skills/pipeline/scripts/specialist-liveness.mjs");
const start = "2026-08-25T12:00:00.000Z";
const token = "tester-task-2-attempt-1";

function at(milliseconds) {
  return new Date(Date.parse(start) + milliseconds).toISOString();
}

function input(overrides = {}) {
  return {
    role: "tester",
    attempt: 1,
    attempt_token: token,
    dispatched_at: start,
    now: at(0),
    agent_status: "running",
    probe_sent_at: null,
    heartbeat: null,
    owned_paths_changed: false,
    evidence_changed: false,
    ...overrides,
  };
}

assert.equal(evaluateSpecialistLiveness(input({ now: at(9 * 60_000) })).action, "wait");
assert.equal(evaluateSpecialistLiveness(input({
  dispatched_at: "2026-08-25T12:00:00Z",
  now: "2026-08-25T12:09:00Z",
})).action, "wait");

const probe = evaluateSpecialistLiveness(input({ now: at(10 * 60_000) }));
assert.equal(probe.action, "probe");
assert.equal(probe.deadline_at, at(10 * 60_000 + SPECIALIST_LIVENESS_GRACE_MS));

const grace = evaluateSpecialistLiveness(input({
  now: at(11 * 60_000),
  probe_sent_at: at(10 * 60_000),
}));
assert.equal(grace.action, "wait");

const silent = evaluateSpecialistLiveness(input({
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
}));
assert.equal(silent.action, "interrupt");
assert.equal(silent.failure_kind, "specialist-unresponsive");

const renewed = evaluateSpecialistLiveness(input({
  now: at(19 * 60_000),
  probe_sent_at: at(10 * 60_000),
  heartbeat: { attempt_token: token, received_at: at(11 * 60_000), checkpoint: "RED test file inspected; next action is the scoped edit." },
}));
assert.equal(renewed.action, "wait");
assert.equal(renewed.deadline_at, at(21 * 60_000));

const renewalExpired = evaluateSpecialistLiveness(input({
  now: at(21 * 60_000),
  probe_sent_at: at(10 * 60_000),
  heartbeat: { attempt_token: token, received_at: at(11 * 60_000), checkpoint: "RED test file inspected; next action is the scoped edit." },
}));
assert.equal(renewalExpired.action, "interrupt");

const staleToken = evaluateSpecialistLiveness(input({
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  heartbeat: { attempt_token: "other-attempt", received_at: at(11 * 60_000), checkpoint: "Not correlated." },
}));
assert.equal(staleToken.action, "interrupt");

for (const status of ["completed", "failed", "blocked"]) {
  assert.equal(evaluateSpecialistLiveness(input({ agent_status: status })).action, "collect");
}

const replace = evaluateSpecialistLiveness(input({ agent_status: "interrupted" }));
assert.equal(replace.action, "replace");
assert.equal(replace.replacement_attempt, 2);

const dirty = evaluateSpecialistLiveness(input({ agent_status: "interrupted", owned_paths_changed: true }));
assert.equal(dirty.action, "block");
assert.equal(dirty.error_code, "SPECIALIST_INTERRUPTED_WITH_PROGRESS");

const evidence = evaluateSpecialistLiveness(input({ agent_status: "interrupted", evidence_changed: true }));
assert.equal(evidence.action, "block");

const exhausted = evaluateSpecialistLiveness(input({ agent_status: "interrupted", attempt: 2 }));
assert.equal(exhausted.action, "block");
assert.equal(exhausted.error_code, "SPECIALIST_RETRY_EXHAUSTED");

assert.equal(evaluateSpecialistLiveness(input({ role: "architect" })).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({ probe_sent_at: at(1) })).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({ unexpected: true })).error_code, "ARGUMENT_INVALID");

const cli = spawnSync(process.execPath, [helper, "{}"], { cwd: repositoryRoot, encoding: "utf8" });
assert.equal(cli.status, 1);
assert.equal(cli.stderr, "");
assert.equal(JSON.parse(cli.stdout).error_code, "ARGUMENT_INVALID");

console.log("specialist liveness: PASS");
