#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  bindConsolidatedGate1,
  canonicalJsonBytes,
  createOpenSpecBindingsManifest,
  verifyConsolidatedGate1,
  verifyOpenSpecBindingsManifest,
} from "../skills/pipeline/scripts/openspec-bindings.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function snapshot({ repository, workspace, service }) {
  const artifact = {
    artifact_id: "tasks",
    path: `openspec/changes/${service}/tasks.md`,
    content_sha256: "a".repeat(64),
    intent_sha256: "b".repeat(64),
    coordinates: [{ kind: "task", id: "task:1.1", title: "Implement service", line: 1, complete: false }],
  };
  return {
    schema_version: 3,
    kind: "team_harness_openspec_snapshot",
    captured_at: "2026-08-24T12:00:00Z",
    repository: { root: repository, head_sha: "c".repeat(40) },
    workspace: { root: workspace, mode: "obsidian", navigation_kind: "repository-relative-coordinates" },
    toolchain: { runtime: "codex", node_version: "22.0.0", npm_version: "10.0.0", openspec_version: "1.9.0", generated_targets: [] },
    change: { name: service, schema: "spec-driven", root: path.join(repository, "openspec", "changes", service) },
    artifacts: [artifact],
    artifact_set_sha256: hash(Buffer.from(`${artifact.path}\0${artifact.content_sha256}`)),
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "th-openspec-bindings-"));
  const workspace = path.join(root, "vault", "zippy", "2026-08-24_payment-flow");
  await mkdir(workspace, { recursive: true });
  const services = ["merchant-bridge", "payments-orchestrator", "transactions"];
  const bindings = [];
  for (const service of services) {
    const repository = path.join(root, "zippy", service);
    const planningRoot = path.join(repository, "openspec", "changes", service);
    await mkdir(planningRoot, { recursive: true });
    const snapshotPath = path.join(workspace, "inputs", "openspec", service, "snapshot.json");
    const overlayPath = path.join(workspace, "plan", "openspec", service, "traceability.json");
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await mkdir(path.dirname(overlayPath), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot({ repository, workspace, service }))}\n`);
    await writeFile(overlayPath, `${JSON.stringify({ service, valid: true })}\n`);
    bindings.push({
      service,
      repository_root: repository,
      repository_identity: `identity:${service}`,
      change_name: service,
      planning_root: planningRoot,
      schema: "spec-driven",
      cli_version: "1.9.0",
      generated_skill_identity: `openspec-1.9.0:${service}`,
    });
  }
  const evidenceRepository = path.join(root, "zippy", "payment-gateway");
  await mkdir(evidenceRepository, { recursive: true });
  const evidenceRepositories = [{
    service: "payment-gateway",
    role: "evidence-only",
    repository_root: evidenceRepository,
    repository_identity: "identity:payment-gateway",
    purpose: "Read-only contract evidence.",
  }];
  const dependencies = [
    { from: "merchant-bridge", to: "payments-orchestrator", kind: "request-contract" },
    { from: "payments-orchestrator", to: "transactions", kind: "transaction-contract" },
  ];
  const executionOrder = services.slice();
  const repositoryIdentityReader = async repository => `identity:${path.basename(repository)}`;
  const overlayValidator = async () => ({ verdict: "pass" });
  return { root, workspace, services, bindings, evidenceRepositories, dependencies, executionOrder, repositoryIdentityReader, overlayValidator };
}

async function use(callback) {
  const value = await fixture();
  try { await callback(value); } finally { await rm(value.root, { recursive: true, force: true }); }
}

console.log("=== OpenSpec multi-service bindings ===");

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  assert.equal(created.verdict, "pass");
  assert.deepEqual(created.manifest.bindings.map(item => item.service), value.services);
  assert.deepEqual(created.manifest.evidence_repositories.map(item => item.service), ["payment-gateway"]);
  assert.equal(created.manifest.evidence_repositories[0].role, "evidence-only");
  assert.match(created.aggregate_sha256, /^[a-f0-9]{64}$/);
  console.log("  [PASS] three writable owners and one evidence-only repository");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const seen = [];
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayValidator: value.overlayValidator,
    phase: "implementation",
    authorizedTasksByService: { transactions: ["1.1"] },
    snapshotVerifier: async options => { seen.push(options); return { verdict: "pass" }; },
  });
  assert.equal(verified.verdict, "pass");
  assert.deepEqual(seen.find(item => item.snapshotPath.includes("transactions")).authorizedTaskIds, ["1.1"]);
  assert.deepEqual(seen.find(item => item.snapshotPath.includes("merchant-bridge")).authorizedTaskIds, []);
  console.log("  [PASS] per-service freshness and monotonic progress authorization");
});

await use(async value => {
  const mismatch = await createOpenSpecBindingsManifest({ ...value, repositoryIdentityReader: async () => "wrong" });
  assert.equal(mismatch.error_code, "REPOSITORY_IDENTITY_MISMATCH");
  assert.equal(mismatch.failed_binding, "merchant-bridge");
  console.log("  [PASS] repository identity mismatch fails closed");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const snapshotPath = path.join(value.workspace, "inputs", "openspec", "payments-orchestrator", "snapshot.json");
  await unlink(snapshotPath);
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader, overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(verified.verdict, "fail");
  assert.equal(verified.failed_binding, "payments-orchestrator");
  console.log("  [PASS] unreadable required artifact fails closed");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  await writeFile(path.join(value.workspace, "plan", "openspec", "transactions", "traceability.json"), "changed\n");
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader, overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(verified.error_code, "BINDING_STALE");
  assert.equal(verified.failed_binding, "transactions");
  console.log("  [PASS] stale child hash fails closed");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  assert.equal(gate.scope, "initiative");
  assert.deepEqual(gate.binding_services, value.executionOrder);
  assert.equal(Object.hasOwn(gate, "child_gate"), false);
  assert.equal(verifyConsolidatedGate1({ gate, manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" }).verdict, "pass");
  const reordered = { ...created.manifest, execution_order: created.manifest.execution_order.slice().reverse() };
  assert.equal(verifyConsolidatedGate1({ gate, manifest: reordered, aggregateSha256: hash(canonicalJsonBytes(reordered)), nonce: "gate-1-nonce" }).error_code, "GATE1_IDENTITY_STALE");
  console.log("  [PASS] one consolidated Gate 1 binds membership, order, hash, and nonce");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const aggregateBytes = await readFile(created.aggregate_path);
  const changed = JSON.parse(aggregateBytes);
  changed.execution_order = changed.execution_order.slice(0, 2);
  await writeFile(created.aggregate_path, canonicalJsonBytes(changed));
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader, overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(verified.error_code, "AGGREGATE_STALE");
  console.log("  [PASS] aggregate membership or order drift invalidates freshness");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest({
    ...value, executionOrder: value.executionOrder.slice().reverse(),
  });
  assert.equal(created.verdict, "fail");
  assert.equal(created.error_code, "BINDING_INVALID");
  console.log("  [PASS] execution order must satisfy declared dependencies");
});

console.log("OpenSpec multi-service bindings: PASS");
