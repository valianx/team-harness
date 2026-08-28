#!/usr/bin/env node

import { isDirectExecution } from "./cli-entrypoint.mjs";

export const SPECIALIST_LIVENESS_SCHEMA_VERSION = 5;
export const SPECIALIST_LIVENESS_GRACE_MS = 120_000;

export const SPECIALIST_SLA_MS = Object.freeze({
  implementer: 15 * 60_000,
  tester: 10 * 60_000,
  cleaner: 5 * 60_000,
  qa: 5 * 60_000,
  security: 10 * 60_000,
  delivery: 5 * 60_000,
});

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUSES = new Set(["running", "completed", "failed", "blocked", "interrupted"]);
const PROBE_DELIVERY_STATES = new Set(["unconfirmed", "confirmed"]);
const INTERRUPTION_CAUSES = new Set([
  "specialist-unresponsive",
  "specialist-probe-delivery-unconfirmed",
  "operator-cancelled",
]);
const INPUT_KEYS = new Set([
  "role", "attempt", "attempt_token", "dispatched_at", "now", "agent_status",
  "probe_sent_at", "probe_delivery_state", "probe_delivered_at", "heartbeat",
  "owned_paths_changed", "evidence_changed", "interruption_cause", "continuation_count",
]);
const HEARTBEAT_KEYS = new Set(["attempt_token", "received_at", "checkpoint"]);

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every(key => keys.has(key));
}

function timestamp(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? parsed : null;
}

function decision({
  verdict = "pass",
  errorCode = null,
  action,
  deadlineAt = null,
  attempt = null,
  continuationCount = null,
  failureKind = null,
  observation,
}) {
  return {
    schema_version: SPECIALIST_LIVENESS_SCHEMA_VERSION,
    kind: "team_harness_specialist_liveness_decision",
    verdict,
    error_code: errorCode,
    action,
    deadline_at: deadlineAt,
    attempt,
    continuation_count: continuationCount,
    failure_kind: failureKind,
    observation,
  };
}

function invalid(attempt = null) {
  return decision({
    verdict: "fail",
    errorCode: "ARGUMENT_INVALID",
    action: "block",
    attempt,
    failureKind: "specialist-liveness-invalid",
    observation: "The specialist liveness input is invalid; do not interrupt or replace the active attempt.",
  });
}

function iso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

/**
 * Decide the next coordinator action for one implementation-or-later specialist.
 * The helper is pure: native status, interruption, path audit, and dispatch remain
 * coordinator operations.
 */
export function evaluateSpecialistLiveness(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !hasOnlyKeys(input, INPUT_KEYS)) return invalid();
  const {
    role,
    attempt,
    attempt_token: attemptToken,
    dispatched_at: dispatchedAtValue,
    now: nowValue,
    agent_status: agentStatus,
    probe_sent_at: probeSentAtValue = null,
    probe_delivery_state: probeDeliveryStateValue = null,
    probe_delivered_at: probeDeliveredAtValue = null,
    heartbeat = null,
    owned_paths_changed: ownedPathsChanged,
    evidence_changed: evidenceChanged,
    interruption_cause: interruptionCause = null,
    continuation_count: continuationCount = 0,
  } = input;
  const dispatchedAt = timestamp(dispatchedAtValue);
  const now = timestamp(nowValue);
  const probeSentAt = probeSentAtValue === null ? null : timestamp(probeSentAtValue);
  const probeDeliveredAt = probeDeliveredAtValue === null ? null : timestamp(probeDeliveredAtValue);
  const probeDeliveryState = probeSentAt === null
    ? null
    : (probeDeliveryStateValue ?? "unconfirmed");
  const sla = SPECIALIST_SLA_MS[role];
  if (!Number.isInteger(sla) || !Number.isSafeInteger(attempt) || attempt < 1
    || !TOKEN.test(attemptToken ?? "")
    || dispatchedAt === null || now === null || now < dispatchedAt || !STATUSES.has(agentStatus)
    || typeof ownedPathsChanged !== "boolean" || typeof evidenceChanged !== "boolean"
    || !Number.isSafeInteger(continuationCount) || continuationCount < 0
    || (interruptionCause !== null && !INTERRUPTION_CAUSES.has(interruptionCause))
    || (interruptionCause === "specialist-probe-delivery-unconfirmed"
      && (probeSentAt === null || probeDeliveryState !== "unconfirmed"))
    || (probeSentAtValue !== null && (probeSentAt === null || probeSentAt < dispatchedAt || probeSentAt > now))
    || (probeSentAt === null && (probeDeliveryStateValue !== null || probeDeliveredAtValue !== null))
    || (probeSentAt !== null && !PROBE_DELIVERY_STATES.has(probeDeliveryState))
    || (probeDeliveryState === "unconfirmed" && probeDeliveredAtValue !== null)
    || (probeDeliveryState === "confirmed" && (probeDeliveredAt === null
      || probeDeliveredAt < probeSentAt || probeDeliveredAt > now))) {
    return invalid(Number.isInteger(attempt) ? attempt : null);
  }

  if (["completed", "failed", "blocked"].includes(agentStatus)) {
    return decision({
      action: "collect",
      attempt,
      observation: `The ${role} attempt is terminal; collect and classify its returned result.`,
    });
  }

  if (agentStatus === "interrupted") {
    return decision({
      action: "recover",
      attempt,
      continuationCount,
      failureKind: ownedPathsChanged || evidenceChanged
        ? "specialist-interrupted-with-progress"
        : (interruptionCause ?? "specialist-unresponsive"),
      observation: ownedPathsChanged || evidenceChanged
        ? "The interrupted specialist left declared work or evidence; preserve it and enter causal recovery."
        : "The interrupted specialist left no declared progress; enter causal recovery from the observed failure evidence.",
    });
  }

  const initialDeadline = dispatchedAt + sla;
  if (probeSentAt === null) {
    if (now < initialDeadline) {
      return decision({
        action: "wait",
        deadlineAt: iso(initialDeadline),
        attempt,
        observation: `The ${role} attempt remains within its phase SLA.`,
      });
    }
    return decision({
      action: "probe",
      deadlineAt: iso(now + SPECIALIST_LIVENESS_GRACE_MS),
      attempt,
      observation: "Send one token-bound liveness probe and allow the fixed two-minute acknowledgement grace.",
    });
  }
  if (probeSentAt < initialDeadline) return invalid(attempt);

  let validHeartbeatAt = null;
  if (heartbeat !== null) {
    if (!heartbeat || typeof heartbeat !== "object" || Array.isArray(heartbeat)
      || !hasOnlyKeys(heartbeat, HEARTBEAT_KEYS)) return invalid(attempt);
    const receivedAt = timestamp(heartbeat.received_at);
    const checkpoint = heartbeat.checkpoint;
    if (receivedAt === null || receivedAt < probeSentAt || receivedAt > now
      || typeof checkpoint !== "string" || checkpoint.trim() !== checkpoint
      || checkpoint.length === 0 || Buffer.byteLength(checkpoint, "utf8") > 512) return invalid(attempt);
    if (heartbeat.attempt_token === attemptToken) validHeartbeatAt = receivedAt;
  }

  if (validHeartbeatAt !== null) {
    const renewedDeadline = validHeartbeatAt + sla;
    if (now < renewedDeadline) {
      return decision({
        action: "wait",
        deadlineAt: iso(renewedDeadline),
        attempt,
        observation: "The latest matching checkpoint renews this attempt's lease.",
      });
    }
    return decision({
      action: "interrupt",
      attempt,
      failureKind: "specialist-unresponsive",
      observation: "The renewed lease expired; interrupt the attempt before auditing its declared paths.",
    });
  }

  const graceStart = probeDeliveryState === "confirmed" ? probeDeliveredAt : probeSentAt;
  const graceDeadline = graceStart + SPECIALIST_LIVENESS_GRACE_MS;
  if (now < graceDeadline) {
    return decision({
      action: "wait",
      deadlineAt: iso(graceDeadline),
      attempt,
      observation: "The token-bound liveness acknowledgement grace remains open.",
    });
  }
  return decision({
    action: "interrupt",
    attempt,
    failureKind: probeDeliveryState === "confirmed"
      ? "specialist-unresponsive"
      : "specialist-probe-delivery-unconfirmed",
    observation: probeDeliveryState === "confirmed"
      ? "No matching acknowledgement arrived after confirmed probe delivery; interrupt before auditing declared paths."
      : "The runtime accepted the probe but exposed no delivery receipt or matching acknowledgement; interrupt before auditing declared paths and preserve this transport cause.",
  });
}

function parseCli(argv) {
  if (argv.length !== 1 || typeof argv[0] !== "string" || Buffer.byteLength(argv[0], "utf8") > 64 * 1024) return null;
  try {
    const value = JSON.parse(argv[0]);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

if (isDirectExecution(import.meta.url)) {
  const result = evaluateSpecialistLiveness(parseCli(process.argv.slice(2)) ?? null);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
