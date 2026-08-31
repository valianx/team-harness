#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { evaluateSpecialistLiveness } from "../skills/pipeline/scripts/specialist-liveness.mjs";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const helper = resolve(repositoryRoot, "skills/pipeline/scripts/specialist-liveness.mjs");
const base = {
  lease_id: "a".repeat(64),
  session_id: "session-1",
  delivery_state: "accepted",
  acknowledgement_state: "acknowledged",
  terminal_state: "running",
  progress_declared: true,
  interruption_cause: null,
  observed_at: "2026-08-31T12:00:00Z",
};

const running = evaluateSpecialistLiveness(base);
assert.equal(running.verdict, "pass");
assert.deepEqual(running.facts, base);
assert.equal(Object.hasOwn(running, "action"), false);
assert.equal(Object.hasOwn(running, "deadline_at"), false);

for (const terminal_state of ["completed", "failed", "blocked", "interrupted"]) {
  const value = evaluateSpecialistLiveness({
    ...base,
    terminal_state,
    acknowledgement_state: "none",
    delivery_state: "unconfirmed",
    interruption_cause: terminal_state === "interrupted" ? "runtime transport ended" : null,
  });
  assert.equal(value.verdict, "pass");
  assert.equal(value.facts.terminal_state, terminal_state);
}

for (const forbidden of [
  { attempt: 1 }, { continuation_count: 1 }, { elapsed_ms: 1 }, { tool_calls: 1 },
  { action: "replace" }, { deadline_at: "2026-08-31T12:01:00Z" },
]) {
  assert.equal(evaluateSpecialistLiveness({ ...base, ...forbidden }).error_code, "ARGUMENT_INVALID");
}
assert.equal(evaluateSpecialistLiveness({ ...base, acknowledgement_state: "acknowledged", delivery_state: "unconfirmed" }).error_code, "ARGUMENT_INVALID");
assert.equal(evaluateSpecialistLiveness({ ...base, terminal_state: "running", interruption_cause: "timeout" }).error_code, "ARGUMENT_INVALID");

const cli = spawnSync(process.execPath, [helper, "{}"], { cwd: repositoryRoot, encoding: "utf8" });
assert.equal(cli.status, 1);
assert.equal(JSON.parse(cli.stdout).error_code, "ARGUMENT_INVALID");

console.log("specialist liveness facts: PASS");
