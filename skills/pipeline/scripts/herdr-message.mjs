#!/usr/bin/env node
/** Transactional HerdR messaging: discover, wait, stage, submit, and verify. */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_MESSAGE_BYTES = 16 * 1024;
const STATES = new Set(["idle", "working", "blocked", "unknown"]);
const SECRET_LIKE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bAKIA[0-9A-Z]{16}\b|\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*|\b(?:password|passwd|secret|token)\s*[:=]\s*\S+)/i;

const safeString = (value, maximum = 4096) => typeof value === "string" && value.length > 0
  && !value.includes("\0") && Buffer.byteLength(value, "utf8") <= maximum;

function result(status, details = {}) {
  return {
    schema_version: 1,
    kind: "team_harness_herdr_delivery",
    status,
    reason_code: details.reason_code ?? null,
    target: details.target ?? null,
    pane_id: details.pane_id ?? null,
    message_id: details.message_id ?? null,
    staged: details.staged ?? false,
    submitted: details.submitted ?? false,
    verified: status === "received",
  };
}

export function runHerdrCommand(argv, { timeoutMs = 30_000 } = {}) {
  return new Promise(resolve => {
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every(item => safeString(item, MAX_MESSAGE_BYTES))) {
      resolve({ code: null, stdout: "", stderr: "", error: "ARGUMENT_INVALID" });
      return;
    }
    let child;
    try { child = spawn(argv[0], argv.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { resolve({ code: null, stdout: "", stderr: "", error: "COMMAND_UNAVAILABLE" }); return; }
    let settled = false;
    let bytes = 0;
    const stdout = [];
    const stderr = [];
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const collect = target => chunk => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) { child.kill("SIGKILL"); finish({ code: null, stdout: "", stderr: "", error: "OUTPUT_LIMIT" }); return; }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", () => finish({ code: null, stdout: "", stderr: "", error: "COMMAND_UNAVAILABLE" }));
    child.on("close", code => finish({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), error: null }));
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ code: null, stdout: "", stderr: "", error: "TIMEOUT" }); }, timeoutMs);
  });
}

function parseAgentList(output) {
  try {
    const parsed = JSON.parse(output);
    const agents = parsed?.result?.agents;
    if (!Array.isArray(agents)) return null;
    return agents.filter(agent => agent && typeof agent === "object").map(agent => ({
      name: agent.name,
      pane_id: agent.pane_id,
      agent_status: agent.agent_status,
    }));
  } catch { return null; }
}

function transcriptText(output) {
  try {
    const parsed = JSON.parse(output);
    const value = parsed?.result;
    for (const candidate of [value?.text, value?.output, value?.content, value?.transcript]) {
      if (typeof candidate === "string") return candidate;
    }
  } catch { /* Plain text is a supported read format. */ }
  return output;
}

async function capabilities(herdr, runner) {
  const agent = await runner([herdr, "agent"]);
  const pane = await runner([herdr, "pane"]);
  const agentUsage = `${agent?.stdout ?? ""}\n${agent?.stderr ?? ""}`;
  const paneUsage = `${pane?.stdout ?? ""}\n${pane?.stderr ?? ""}`;
  return /agent list/.test(agentUsage) && /agent send/.test(agentUsage) && /agent read/.test(agentUsage)
    && /agent wait/.test(agentUsage) && /pane send-keys/.test(paneUsage);
}

async function discover(herdr, target, runner) {
  const listed = await runner([herdr, "agent", "list"]);
  if (listed?.code !== 0) return { ok: false, reason_code: listed?.error ?? "LIST_FAILED" };
  const agents = parseAgentList(listed.stdout);
  if (agents === null) return { ok: false, reason_code: "LIST_INVALID" };
  const matches = agents.filter(agent => agent.name === target);
  if (matches.length !== 1) return { ok: false, reason_code: matches.length === 0 ? "TARGET_NOT_FOUND" : "TARGET_AMBIGUOUS" };
  const agent = matches[0];
  if (!safeString(agent.pane_id, 256) || !STATES.has(agent.agent_status)) return { ok: false, reason_code: "TARGET_INVALID" };
  return { ok: true, agent };
}

function envelope({ senderRole, initiative, feature, repository, workspace, purpose, responseRequired, message, messageId }) {
  return [
    "[Team Harness agent message]",
    `sender_role: ${senderRole}`,
    `initiative: ${initiative ?? "null"}`,
    `feature: ${feature ?? "null"}`,
    `repository: ${repository}`,
    `workspace: ${workspace}`,
    `purpose: ${purpose}`,
    `response_required: ${responseRequired ? "yes" : "no"}`,
    `message_id: ${messageId}`,
    "",
    message,
  ].join("\n");
}

export async function sendHerdrMessage({
  target,
  senderRole,
  initiative = null,
  feature = null,
  repository,
  workspace,
  purpose,
  responseRequired = true,
  message,
  timeoutMs = 30_000,
  verificationAttempts = 3,
  herdr = "herdr",
  messageId = randomUUID(),
  runner = runHerdrCommand,
} = {}) {
  if (![target, senderRole, repository, workspace, purpose, message, herdr, messageId].every(value => safeString(value, MAX_MESSAGE_BYTES))
    || (initiative === null) === (feature === null) || (initiative !== null && !safeString(initiative, 256))
    || (feature !== null && !safeString(feature, 256)) || typeof responseRequired !== "boolean"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000
    || !Number.isSafeInteger(verificationAttempts) || verificationAttempts < 1 || verificationAttempts > 10
    || SECRET_LIKE.test(message)) return result("failed", { reason_code: "ARGUMENT_INVALID", target: target ?? null });
  if (!(await capabilities(herdr, runner))) return result("unavailable", { reason_code: "CAPABILITY_UNAVAILABLE", target });
  let discovered = await discover(herdr, target, runner);
  if (!discovered.ok) return result("failed", { reason_code: discovered.reason_code, target });
  if (discovered.agent.agent_status !== "idle") {
    const waited = await runner([herdr, "agent", "wait", target, "--status", "idle", "--timeout", String(timeoutMs)], { timeoutMs: timeoutMs + 1000 });
    if (waited?.code !== 0) return result("pending-busy", { reason_code: "BUSY_TIMEOUT", target, pane_id: discovered.agent.pane_id, message_id: messageId });
    discovered = await discover(herdr, target, runner);
    if (!discovered.ok || discovered.agent.agent_status !== "idle") {
      return result("pending-busy", { reason_code: discovered.reason_code ?? "TARGET_NOT_IDLE", target, pane_id: discovered.agent?.pane_id ?? null, message_id: messageId });
    }
  }
  const paneId = discovered.agent.pane_id;
  const text = envelope({ senderRole, initiative, feature, repository, workspace, purpose, responseRequired, message, messageId });
  if (Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES) return result("failed", { reason_code: "MESSAGE_TOO_LARGE", target, pane_id: paneId, message_id: messageId });
  const staged = await runner([herdr, "agent", "send", target, text]);
  if (staged?.code !== 0) return result("failed", { reason_code: staged?.error ?? "STAGE_FAILED", target, pane_id: paneId, message_id: messageId });
  const revalidated = await discover(herdr, target, runner);
  if (!revalidated.ok || revalidated.agent.pane_id !== paneId || revalidated.agent.agent_status !== "idle") {
    return result("staged-not-submitted", { reason_code: "TARGET_DRIFT", target, pane_id: paneId, message_id: messageId, staged: true });
  }
  const submitted = await runner([herdr, "pane", "send-keys", paneId, "enter"]);
  if (submitted?.code !== 0) {
    await runner([herdr, "agent", "read", target, "--source", "recent-unwrapped", "--lines", "120", "--format", "text"]);
    return result("staged-not-submitted", { reason_code: submitted?.error ?? "SUBMIT_FAILED", target, pane_id: paneId, message_id: messageId, staged: true });
  }
  for (let attempt = 0; attempt < verificationAttempts; attempt += 1) {
    const read = await runner([herdr, "agent", "read", target, "--source", "recent-unwrapped", "--lines", "120", "--format", "text"]);
    if (read?.code === 0 && transcriptText(read.stdout).includes(`message_id: ${messageId}`)) {
      return result("received", { target, pane_id: paneId, message_id: messageId, staged: true, submitted: true });
    }
  }
  return result("submitted-unverified", { reason_code: "RECEIPT_UNVERIFIED", target, pane_id: paneId, message_id: messageId, staged: true, submitted: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("herdr-message.mjs is a library helper; Team Harness supplies a bounded message envelope.\n");
  process.exitCode = 2;
}
