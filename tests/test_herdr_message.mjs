#!/usr/bin/env node

import assert from "node:assert/strict";

import { sendHerdrMessage } from "../skills/pipeline/scripts/herdr-message.mjs";

const target = "transactions-agent";
const base = {
  target,
  senderRole: "th-coordinator",
  initiative: "payment-flow",
  repository: "/repos/transactions",
  workspace: "/vault/zippy/2026-08-24_payment-flow",
  purpose: "coordinate service-owned OpenSpec",
  responseRequired: true,
  message: "Validate your own OpenSpec binding.",
  messageId: "msg-123",
};

function fake({ initialStatus = "idle", afterStageStatus = initialStatus, pane = "w1:p1", driftPane = null, sendCode = 0, enterCode = 0, receipt = true, capabilities = true } = {}) {
  const calls = [];
  let lists = 0;
  const runner = async argv => {
    calls.push(argv);
    if (argv[1] === "agent" && argv.length === 2) return { code: 2, stdout: capabilities ? "agent list\nagent send\nagent read\n" : "agent list\n", stderr: "" };
    if (argv[1] === "pane" && argv.length === 2) return { code: 2, stdout: capabilities ? "pane current\npane send-keys\n" : "", stderr: "" };
    if (argv.slice(1, 3).join(" ") === "pane current") {
      return { code: 0, stdout: JSON.stringify({ result: { pane: { agent: "codex", label: "fixes", pane_id: "sender:p1", terminal_id: "term_sender" } } }), stderr: "" };
    }
    if (argv.slice(1, 3).join(" ") === "agent list") {
      lists += 1;
      const status = lists === 1 ? initialStatus : afterStageStatus;
      const paneId = lists >= 2 && driftPane ? driftPane : pane;
      return { code: 0, stdout: JSON.stringify({ result: { agents: [{ name: target, pane_id: paneId, agent_status: status }] } }), stderr: "" };
    }
    if (argv.slice(1, 3).join(" ") === "agent send") return { code: sendCode, stdout: "{}", stderr: "" };
    if (argv.slice(1, 3).join(" ") === "pane send-keys") return { code: enterCode, stdout: "{}", stderr: "" };
    if (argv.slice(1, 3).join(" ") === "agent read") return { code: 0, stdout: receipt ? "message_id: msg-123\ncommitted" : "no matching receipt", stderr: "" };
    throw new Error(`unexpected argv ${argv.join(" ")}`);
  };
  return { runner, calls };
}

{
  const value = fake({ capabilities: false });
  assert.equal((await sendHerdrMessage({ ...base, runner: value.runner })).status, "unavailable");
  assert.equal(value.calls.some(argv => argv.includes("send")), false);
}

{
  const value = fake();
  const runner = async argv => {
    if (argv.slice(1, 3).join(" ") === "pane current") return { code: 1, stdout: "", stderr: "not in a HerdR pane" };
    return value.runner(argv);
  };
  const result = await sendHerdrMessage({ ...base, runner });
  assert.equal(result.status, "failed");
  assert.equal(result.reason_code, "SENDER_LOOKUP_FAILED");
  assert.equal(value.calls.some(argv => argv.slice(1, 3).join(" ") === "agent send"), false);
}

{
  const value = fake();
  const delivered = await sendHerdrMessage({ ...base, message: "Literal $HOME; $(touch /tmp/nope) `id`", runner: value.runner });
  assert.equal(delivered.status, "received");
  const send = value.calls.find(argv => argv.slice(1, 3).join(" ") === "agent send");
  assert.equal(send.length, 5);
  assert.match(send[4], /sender_role: th-coordinator/);
  assert.match(send[4], /sender_agent: codex/);
  assert.match(send[4], /sender_name: fixes/);
  assert.match(send[4], /sender_terminal_id: term_sender/);
  assert.match(send[4], /sender_pane_id: sender:p1/);
  assert.match(send[4], /response_channel: current-session-output/);
  assert.match(send[4], /Literal \$HOME; \$\(touch \/tmp\/nope\) `id`/);
  const enter = value.calls.find(argv => argv.slice(1, 3).join(" ") === "pane send-keys");
  assert.deepEqual(enter.slice(1), ["pane", "send-keys", "w1:p1", "enter"]);
}

for (const status of ["working", "blocked", "unknown"]) {
  const value = fake({ initialStatus: status, receipt: false });
  const queued = await sendHerdrMessage({ ...base, runner: value.runner });
  assert.equal(queued.status, "queued");
  assert.equal(queued.reason_code, "RECEIPT_PENDING");
  assert.equal(value.calls.filter(argv => argv.slice(1, 3).join(" ") === "agent send").length, 1);
  assert.equal(value.calls.filter(argv => argv.slice(1, 3).join(" ") === "pane send-keys").length, 1);
  assert.equal(value.calls.some(argv => argv.slice(1, 3).join(" ") === "agent wait"), false);
}

{
  const value = fake({ initialStatus: "working", afterStageStatus: "blocked" });
  assert.equal((await sendHerdrMessage({ ...base, runner: value.runner })).status, "received");
  assert.equal(value.calls.some(argv => argv.slice(1, 3).join(" ") === "agent wait"), false);
  const enter = value.calls.find(argv => argv.slice(1, 3).join(" ") === "pane send-keys");
  assert.deepEqual(enter.slice(1), ["pane", "send-keys", "w1:p1", "enter"]);
}

{
  const value = fake({ driftPane: "w1:p2" });
  const result = await sendHerdrMessage({ ...base, runner: value.runner });
  assert.equal(result.status, "staged-not-submitted");
  assert.equal(value.calls.some(argv => argv.slice(1, 3).join(" ") === "pane send-keys"), false);
}

{
  const value = fake({ enterCode: 1 });
  const result = await sendHerdrMessage({ ...base, runner: value.runner });
  assert.equal(result.status, "staged-not-submitted");
  assert.equal(value.calls.filter(argv => argv.slice(1, 3).join(" ") === "agent send").length, 1);
}

{
  const value = fake({ receipt: false });
  const delays = [];
  const result = await sendHerdrMessage({
    ...base, runner: value.runner, verificationAttempts: 2,
    sleeper: async delayMs => { delays.push(delayMs); },
  });
  assert.equal(result.status, "queued");
  assert.equal(result.reason_code, "RECEIPT_PENDING");
  assert.equal(value.calls.filter(argv => argv.slice(1, 3).join(" ") === "agent send").length, 1, "queued input must not resend");
  assert.equal(value.calls.filter(argv => argv.slice(1, 3).join(" ") === "agent read").length, 2);
  assert.deepEqual(delays, [100]);
}

{
  const duplicate = async argv => {
    if (argv[1] === "agent" && argv.length === 2) return { code: 2, stdout: "agent list\nagent send\nagent read\n", stderr: "" };
    if (argv[1] === "pane" && argv.length === 2) return { code: 2, stdout: "pane current\npane send-keys\n", stderr: "" };
    if (argv.slice(1, 3).join(" ") === "pane current") {
      return { code: 0, stdout: JSON.stringify({ result: { pane: { agent: "codex", label: "fixes", pane_id: "sender:p1", terminal_id: "term_sender" } } }), stderr: "" };
    }
    return { code: 0, stdout: JSON.stringify({ result: { agents: [
      { name: target, pane_id: "a", agent_status: "idle" }, { name: target, pane_id: "b", agent_status: "idle" },
    ] } }), stderr: "" };
  };
  const result = await sendHerdrMessage({ ...base, runner: duplicate });
  assert.equal(result.reason_code, "TARGET_AMBIGUOUS");
}

{
  const value = fake();
  const result = await sendHerdrMessage({ ...base, message: "token=super-secret-value-1234567890", runner: value.runner });
  assert.equal(result.reason_code, "ARGUMENT_INVALID");
  assert.equal(value.calls.length, 0);
}

{
  const value = fake();
  const result = await sendHerdrMessage({ ...base, purpose: "token=super-secret-value-1234567890", runner: value.runner });
  assert.equal(result.reason_code, "ARGUMENT_INVALID");
  assert.equal(value.calls.length, 0);
}

console.log("HerdR message adapter: PASS");
