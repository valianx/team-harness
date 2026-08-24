#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  discoverWorkspaceIdentity,
  isWorkspaceIdentity,
  resolveWorkspaceIdentity,
} from "../skills/pipeline/scripts/workspace-identity.mjs";

const root = await mkdtemp(path.join(tmpdir(), "th-workspace-identity-"));
try {
  const repos = path.join(root, "zippy");
  const merchant = path.join(repos, "merchant-bridge");
  const orchestrator = path.join(repos, "payments-orchestrator");
  const transactions = path.join(repos, "transactions");
  const gateway = path.join(repos, "payment-gateway");
  const vault = path.join(root, "vault");
  for (const directory of [merchant, orchestrator, transactions, gateway, vault]) await mkdir(directory, { recursive: true });
  const bindings = [
    { service: "merchant-bridge", root: merchant, identity: "origin:merchant", role: "writable-owner" },
    { service: "payments-orchestrator", root: orchestrator, identity: "origin:orchestrator", role: "writable-owner" },
    { service: "transactions", root: transactions, identity: "origin:transactions", role: "writable-owner" },
    { service: "payment-gateway", root: gateway, identity: "origin:gateway", role: "evidence-only" },
  ];

  const identity = await resolveWorkspaceIdentity({
    logsMode: "obsidian", logsPath: vault, logsSubfolder: "work-logs", repositories: bindings,
    initiative: "payment-flow", date: "2026-08-24",
  });
  assert.equal(identity.coordinator_root, path.join(vault, "work-logs", "zippy", "2026-08-24_payment-flow"));
  assert.deepEqual(identity.services.map(entry => entry.workspace), [
    path.join(identity.coordinator_root, "merchant-bridge"),
    path.join(identity.coordinator_root, "payments-orchestrator"),
    path.join(identity.coordinator_root, "transactions"),
  ]);
  assert.deepEqual(identity.evidence_repositories.map(entry => entry.service), ["payment-gateway"]);
  assert.equal(isWorkspaceIdentity(identity), true);

  const single = await resolveWorkspaceIdentity({
    logsMode: "local", repositories: [bindings[0]], feature: "refund-fix", date: "2026-08-24",
  });
  assert.equal(single.coordinator_root, path.join(merchant, "workspaces", "2026-08-24_refund-fix"));

  const preserved = await resolveWorkspaceIdentity({ persistedIdentity: identity });
  assert.deepEqual(preserved, identity);
  preserved.date = "2000-01-01";
  assert.equal(identity.date, "2026-08-24", "persisted identity must be returned as a copy");

  await assert.rejects(
    () => resolveWorkspaceIdentity({ logsMode: "obsidian", logsPath: vault, logsSubfolder: "../escape", repositories: bindings, initiative: "payment-flow", date: "2026-08-24" }),
    /logs-subfolder invalid/,
  );
  await assert.rejects(
    () => resolveWorkspaceIdentity({ logsMode: "local", repositories: [bindings[0], { ...bindings[1], root: path.join(root, "elsewhere", "service") }], initiative: "split", date: "2026-08-24" }),
  );

  const candidate = identity.coordinator_root;
  await mkdir(path.join(candidate, "inputs"), { recursive: true });
  await writeFile(path.join(candidate, "inputs", "workspace-identity.json"), `${JSON.stringify(identity)}\n`);
  const repositoryIdentities = bindings.map(({ service, identity: repositoryIdentity, role }) => ({ service, identity: repositoryIdentity, role }));
  const found = await discoverWorkspaceIdentity({ searchRoot: path.dirname(candidate), slug: "payment-flow", repositoryIdentities });
  assert.equal(found.status, "found");
  assert.equal(found.identity.coordinator_root, candidate);

  const duplicate = path.join(path.dirname(candidate), "2026-08-25_payment-flow");
  const duplicateIdentity = { ...identity, coordinator_root: duplicate, date: "2026-08-25", services: identity.services.map(entry => ({ ...entry, workspace: path.join(duplicate, entry.service) })) };
  await mkdir(path.join(duplicate, "inputs"), { recursive: true });
  await writeFile(path.join(duplicate, "inputs", "workspace-identity.json"), `${JSON.stringify(duplicateIdentity)}\n`);
  assert.equal((await discoverWorkspaceIdentity({ searchRoot: path.dirname(candidate), slug: "payment-flow", repositoryIdentities })).status, "ambiguous");

  console.log("workspace identity: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
