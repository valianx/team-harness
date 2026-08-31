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
assert.equal(silent.failure_kind, "specialist-probe-delivery-unconfirmed");

const deliveredSilent = evaluateSpecialistLiveness(input({
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  probe_delivery_state: "confirmed",
  probe_delivered_at: at(10 * 60_000),
}));
assert.equal(deliveredSilent.action, "interrupt");
assert.equal(deliveredSilent.failure_kind, "specialist-unresponsive");

const deliveredLater = evaluateSpecialistLiveness(input({
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  probe_delivery_state: "confirmed",
  probe_delivered_at: at(11 * 60_000),
}));
assert.equal(deliveredLater.action, "wait");
assert.equal(deliveredLater.deadline_at, at(13 * 60_000));

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

for (const attempt of [1, 2, 57]) {
  const recovered = evaluateSpecialistLiveness(input({
    agent_status: "interrupted",
    attempt,
    attempt_token: `tester-task-2-attempt-${attempt}`,
  }));
  assert.equal(recovered.action, "recover");
  assert.equal(recovered.error_code, null);
  assert.equal(recovered.attempt, attempt);
}

const dirty = evaluateSpecialistLiveness(input({ agent_status: "interrupted", owned_paths_changed: true }));
assert.equal(dirty.action, "recover");
assert.equal(dirty.failure_kind, "specialist-interrupted-with-progress");

const transportInterruptedWithProgress = evaluateSpecialistLiveness(input({
  agent_status: "interrupted",
  owned_paths_changed: true,
  interruption_cause: "specialist-probe-delivery-unconfirmed",
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  probe_delivery_state: "unconfirmed",
}));
assert.equal(transportInterruptedWithProgress.action, "recover");
assert.equal(transportInterruptedWithProgress.attempt, 1);
assert.equal(transportInterruptedWithProgress.continuation_count, 0);
assert.equal(transportInterruptedWithProgress.error_code, null);

const resumedInterruptedWithProgress = evaluateSpecialistLiveness(input({
  agent_status: "interrupted",
  owned_paths_changed: true,
  interruption_cause: "specialist-probe-delivery-unconfirmed",
  continuation_count: 1,
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  probe_delivery_state: "unconfirmed",
}));
assert.equal(resumedInterruptedWithProgress.action, "recover");
assert.equal(resumedInterruptedWithProgress.failure_kind, "specialist-interrupted-with-progress");

const confirmedInterruptedWithProgress = evaluateSpecialistLiveness(input({
  agent_status: "interrupted",
  owned_paths_changed: true,
  interruption_cause: "specialist-unresponsive",
}));
assert.equal(confirmedInterruptedWithProgress.action, "recover");

const evidence = evaluateSpecialistLiveness(input({ agent_status: "interrupted", evidence_changed: true }));
assert.equal(evidence.action, "recover");

const observedContinuations = evaluateSpecialistLiveness(input({
  agent_status: "interrupted",
  continuation_count: 57,
}));
assert.equal(observedContinuations.action, "recover");
assert.equal(observedContinuations.continuation_count, 57);

assert.equal(evaluateSpecialistLiveness(input({ role: "architect" })).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({ attempt: 0 })).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({ probe_sent_at: at(1) })).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  probe_delivery_state: "confirmed",
})).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({
  now: at(12 * 60_000),
  probe_sent_at: at(10 * 60_000),
  probe_delivery_state: "unconfirmed",
  probe_delivered_at: at(10 * 60_000),
})).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({ unexpected: true })).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness(input({ dispatch_ready_at: at(1) })).error_code, "ARGUMENT_INVALID");

const cli = spawnSync(process.execPath, [helper, "{}"], { cwd: repositoryRoot, encoding: "utf8" });
assert.equal(cli.status, 1);
assert.equal(cli.stderr, "");
assert.equal(JSON.parse(cli.stdout).error_code, "ARGUMENT_INVALID");

console.log("specialist liveness: PASS");
