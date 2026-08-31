#!/usr/bin/env node
/** Report bounded specialist transport facts. This helper never selects a route. */

import { isDirectExecution } from "./cli-entrypoint.mjs";

export const SPECIALIST_LIVENESS_SCHEMA_VERSION = 6;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DELIVERY = new Set(["unconfirmed", "accepted", "rejected"]);
const ACKNOWLEDGEMENT = new Set(["none", "acknowledged"]);
const TERMINALITY = new Set(["running", "completed", "failed", "blocked", "interrupted"]);
const KEYS = [
  "lease_id", "session_id", "delivery_state", "acknowledgement_state", "terminal_state",
  "progress_declared", "interruption_cause", "observed_at",
];

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validTimestamp(value) {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value))
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function invalid() {
  return {
    schema_version: SPECIALIST_LIVENESS_SCHEMA_VERSION,
    kind: "team_harness_specialist_liveness_facts",
    verdict: "fail",
    error_code: "ARGUMENT_INVALID",
    facts: null,
  };
}

export function evaluateSpecialistLiveness(input = {}) {
  if (!exact(input, KEYS) || !SHA256.test(input.lease_id ?? "") || !ID.test(input.session_id ?? "")
    || !DELIVERY.has(input.delivery_state) || !ACKNOWLEDGEMENT.has(input.acknowledgement_state)
    || !TERMINALITY.has(input.terminal_state) || typeof input.progress_declared !== "boolean"
    || (input.interruption_cause !== null && (typeof input.interruption_cause !== "string"
      || input.interruption_cause.length === 0 || input.interruption_cause.length > 160))
    || !validTimestamp(input.observed_at)
    || (input.acknowledgement_state === "acknowledged" && input.delivery_state !== "accepted")
    || (input.terminal_state !== "interrupted" && input.interruption_cause !== null)) return invalid();
  return {
    schema_version: SPECIALIST_LIVENESS_SCHEMA_VERSION,
    kind: "team_harness_specialist_liveness_facts",
    verdict: "pass",
    error_code: null,
    facts: { ...input },
  };
}

function parseCli(argv) {
  if (argv.length !== 1 || typeof argv[0] !== "string" || Buffer.byteLength(argv[0], "utf8") > 64 * 1024) return null;
  try {
    const value = JSON.parse(argv[0]);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

if (isDirectExecution(import.meta.url)) {
  const result = evaluateSpecialistLiveness(parseCli(process.argv.slice(2)) ?? null);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
