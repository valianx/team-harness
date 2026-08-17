#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MAX_FILE_BYTES,
  initializeProject,
  inspectRuntimeIntegration,
  isOpenSpecAdapterResult,
  isOpenSpecPolicy,
  preflight,
  provision,
  semverAtLeast,
} from "../plugins/team-harness/skills/pipeline/scripts/openspec-adapter.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const canonicalPolicy = path.join(root, "skills/pipeline/openspec-policy.json");
const policy = JSON.parse(await readFile(canonicalPolicy, "utf8"));
const failures = [];
const skillNames = ["apply-change", "archive-change", "explore", "propose", "sync-specs", "update-change"];

function envelope({ exitCode = 0, stdout = "", stderr = "", outcome = "completed", truncated = false } = {}) {
  return {
    outcome,
    exit_code: outcome === "completed" ? exitCode : null,
    stdout: { tail: stdout || null, bytes: Buffer.byteLength(stdout), truncated },
    stderr: { tail: stderr || null, bytes: Buffer.byteLength(stderr), truncated: false },
  };
}

function approval() {
  return { decision: "approved", nonce: "decision_12345678", decided_at: "2026-08-17T12:00:00Z" };
}

async function check(name, callback) {
  try { await callback(); process.stdout.write(`  [PASS] ${name}\n`); }
  catch (error) { failures.push(name); process.stdout.write(`  [FAIL] ${name}: ${error.message}\n`); }
}

async function fixture(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "th-openspec-adapter-"));
  try { return await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

function assertClosed(value) {
  assert.equal(isOpenSpecAdapterResult(value), true, JSON.stringify(value));
}

async function writeCodexIntegration(directory, version = "1.9.0") {
  await mkdir(path.join(directory, "openspec"), { recursive: true });
  await writeFile(path.join(directory, "openspec/config.yaml"), "schema: spec-driven\n");
  await mkdir(path.join(directory, ".agents/skills"), { recursive: true });
  await writeFile(path.join(directory, ".agents/skills/.openspec-target"), "codex\n");
  for (const name of skillNames) {
    const target = path.join(directory, `.agents/skills/openspec-${name}/SKILL.md`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `---\nname: openspec-${name}\nmetadata:\n  author: openspec\n  generatedBy: ${version}\n---\n`);
  }
}

function versionRunner(overrides = {}) {
  return async ({ argv }) => {
    if (argv[0] === "node") return overrides.node ?? envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm") return overrides.npm ?? envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec") return overrides.openspec ?? envelope({ stdout: "1.9.0" });
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
}

console.log("=== OpenSpec adapter ===");

await check("ships one exact compatibility policy to every packaged pipeline", async () => {
  assert.equal(isOpenSpecPolicy(policy), true);
  const canonical = await readFile(canonicalPolicy);
  for (const relative of [
    "plugins/team-harness/skills/pipeline/openspec-policy.json",
    "installer-assets/opencode-skills/pipeline/openspec-policy.json",
  ]) assert.deepEqual(await readFile(path.join(root, relative)), canonical);
  assert.equal(semverAtLeast("20.19.0", "20.19.0"), true);
  assert.equal(semverAtLeast("20.19.0-beta.1", "20.19.0"), false);
});

await check("returns ready only for the complete compatible toolchain", async () => fixture(async directory => {
  await writeCodexIntegration(directory);
  const value = await preflight({ projectRoot: directory, runtime: "codex", policy, commandRunner: versionRunner() });
  assertClosed(value);
  assert.equal(value.outcome, "ready");
  assert.equal(value.evidence.targets.length, 8);
}));

await check("distinguishes missing and incompatible prerequisites", async () => fixture(async directory => {
  const cases = [
    [versionRunner({ node: envelope({ outcome: "spawn_error" }) }), "NODE_MISSING", "blocked-prerequisite"],
    [versionRunner({ node: envelope({ stdout: "v20.18.9" }) }), "NODE_INCOMPATIBLE", "blocked-prerequisite"],
    [versionRunner({ npm: envelope({ outcome: "spawn_error" }) }), "NPM_MISSING", "blocked-prerequisite"],
    [versionRunner({ openspec: envelope({ outcome: "spawn_error" }) }), "OPENSPEC_MISSING", "provisionable"],
    [versionRunner({ openspec: envelope({ stdout: "1.8.0" }) }), "OPENSPEC_INCOMPATIBLE", "provisionable"],
  ];
  for (const [runner, code, outcome] of cases) {
    const value = await preflight({ projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
    assertClosed(value);
    assert.equal(value.error_code, code);
    assert.equal(value.outcome, outcome);
  }
}));

await check("distinguishes missing, stale, symlink escape, and unmanaged generated targets", async () => fixture(async directory => {
  const uninitialized = await inspectRuntimeIntegration({ projectRoot: directory, runtime: "codex", policy });
  assert.equal(uninitialized.error_code, "PROJECT_UNINITIALIZED");
  await mkdir(path.join(directory, "openspec"));
  await writeFile(path.join(directory, "openspec/config.yaml"), "schema: spec-driven\n");
  const missing = await inspectRuntimeIntegration({ projectRoot: directory, runtime: "codex", policy });
  assert.equal(missing.error_code, "TARGET_MISSING");

  await writeCodexIntegration(directory, "1.8.0");
  const stale = await inspectRuntimeIntegration({ projectRoot: directory, runtime: "codex", policy });
  assert.equal(stale.error_code, "TARGET_STALE");

  await writeCodexIntegration(directory);
  const skill = path.join(directory, ".agents/skills/openspec-propose/SKILL.md");
  await writeFile(skill, "unmanaged\n");
  const collision = await inspectRuntimeIntegration({ projectRoot: directory, runtime: "codex", policy });
  assert.equal(collision.error_code, "TARGET_COLLISION");

  await rm(skill);
  const outside = await mkdtemp(path.join(tmpdir(), "th-openspec-outside-"));
  try {
    const escaped = path.join(outside, "SKILL.md");
    await writeFile(escaped, "outside\n");
    await symlink(escaped, skill);
    const unsafe = await inspectRuntimeIntegration({ projectRoot: directory, runtime: "codex", policy });
    assert.equal(unsafe.error_code, "TARGET_INVALID");
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
}));

await check("rejects oversized generated files and output", async () => fixture(async directory => {
  await writeCodexIntegration(directory);
  await writeFile(path.join(directory, ".agents/skills/openspec-propose/SKILL.md"), Buffer.alloc(MAX_FILE_BYTES + 1));
  const target = await inspectRuntimeIntegration({ projectRoot: directory, runtime: "codex", policy });
  assert.equal(target.error_code, "TARGET_INVALID");
  const output = await preflight({
    projectRoot: directory,
    runtime: "codex",
    policy,
    commandRunner: versionRunner({ node: envelope({ stdout: "v20.19.0", truncated: true }) }),
  });
  assert.equal(output.error_code, "OUTPUT_LIMIT");
}));

await check("requires the complete live-decision envelope before mutation", async () => fixture(async directory => {
  let calls = 0;
  const value = await provision({
    approval: "approved", projectRoot: directory, runtime: "codex", policy,
    commandRunner: async () => { calls += 1; return envelope(); },
  });
  assertClosed(value);
  assert.equal(value.outcome, "declined");
  assert.equal(value.error_code, "APPROVAL_REQUIRED");
  assert.equal(calls, 0);
}));

await check("initializes a compatible repository without a provisioning approval", async () => fixture(async directory => {
  const calls = [];
  const runner = async ({ argv }) => {
    calls.push(argv);
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec" && argv[1] === "--version") return envelope({ stdout: "1.9.0" });
    if (argv[0] === "openspec" && argv[1] === "init") { await writeCodexIntegration(directory); return envelope(); }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
  const value = await initializeProject({ projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assertClosed(value);
  assert.equal(value.operation, "initialize");
  assert.equal(value.outcome, "ready");
  assert.deepEqual(calls.find(argv => argv[1] === "init"), [
    "openspec", "init", "--tools", "codex", "--no-animation", "--no-copilot-cloud", directory,
  ]);
}));

await check("classifies protected Codex integration writes without exposing raw output", async () => fixture(async directory => {
  const secret = "NPM_TOKEN=never-persist-this";
  const runner = async ({ argv }) => {
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec" && argv[1] === "--version") return envelope({ stdout: "1.9.0" });
    if (argv[0] === "openspec" && argv[1] === "init") {
      return envelope({
        exitCode: 1,
        stderr: `ENOENT: mkdir '${directory}/.agents/skills' ${secret}`,
      });
    }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
  const value = await initializeProject({ projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assertClosed(value);
  assert.equal(value.outcome, "failed");
  assert.equal(value.error_code, "INIT_SANDBOX_DENIED");
  assert.match(value.evidence.diagnostic, /exact init command once.*sandbox escalation.*login:false/i);
  assert.equal(JSON.stringify(value).includes(secret), false);
}));

await check("preserves the sandbox-denied signal through the approved provision route", async () => fixture(async directory => {
  const runner = async ({ argv }) => {
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec" && argv[1] === "--version") return envelope({ stdout: "1.9.0" });
    if (argv[0] === "openspec" && argv[1] === "init") {
      return envelope({ exitCode: 1, stderr: `ENOENT: mkdir '${directory}/.agents/skills'` });
    }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
  const value = await provision({ approval: approval(), projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assertClosed(value);
  assert.equal(value.operation, "provision");
  assert.equal(value.error_code, "INIT_SANDBOX_DENIED");
  assert.notEqual(value.evidence.diagnostic, null);
}));

await check("keeps generic init failures closed with a sanitized diagnostic", async () => fixture(async directory => {
  const secret = "NPM_TOKEN=never-persist-this";
  const runner = async ({ argv }) => {
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec" && argv[1] === "--version") return envelope({ stdout: "1.9.0" });
    if (argv[0] === "openspec" && argv[1] === "init") return envelope({ exitCode: 1, stderr: `unexpected failure ${secret}` });
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
  const value = await initializeProject({ projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assertClosed(value);
  assert.equal(value.error_code, "INIT_FAILED");
  assert.match(value.evidence.diagnostic, /inspect the bounded command output/i);
  assert.equal(JSON.stringify(value).includes(secret), false);
}));

await check("installs the pinned CLI then runs the real upstream init argv", async () => fixture(async directory => {
  const calls = [];
  let installed = false;
  const runner = async ({ argv }) => {
    calls.push(argv);
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm" && argv[1] === "--version") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "npm") { installed = true; return envelope(); }
    if (argv[0] === "openspec" && argv[1] === "--version") {
      return installed ? envelope({ stdout: "1.9.0" }) : envelope({ outcome: "spawn_error" });
    }
    if (argv[0] === "openspec" && argv[1] === "init") { await writeCodexIntegration(directory); return envelope(); }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
  const value = await provision({ approval: approval(), projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assertClosed(value);
  assert.equal(value.outcome, "provisioned");
  assert.deepEqual(calls.find(argv => argv[0] === "npm" && argv[1] === "install"),
    ["npm", "install", "--global", "@fission-ai/openspec@1.9.0"]);
  assert.deepEqual(calls.find(argv => argv[0] === "openspec" && argv[1] === "init").slice(0, 7),
    ["openspec", "init", "--tools", "codex", "--no-animation", "--no-copilot-cloud", directory]);
}));

await check("updates stale integrations and verifies their new ownership", async () => fixture(async directory => {
  await writeCodexIntegration(directory, "1.8.0");
  const calls = [];
  const runner = async ({ argv }) => {
    calls.push(argv);
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec" && argv[1] === "--version") return envelope({ stdout: "1.9.0" });
    if (argv[0] === "openspec" && argv[1] === "update") { await writeCodexIntegration(directory); return envelope(); }
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  };
  const value = await provision({ approval: approval(), projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assert.equal(value.outcome, "provisioned");
  assert.deepEqual(calls.find(argv => argv[1] === "update"), ["openspec", "update", directory]);
}));

await check("failed provisioning is bounded and never persists command output", async () => fixture(async directory => {
  const secret = "NPM_TOKEN=never-persist-this";
  const runner = async ({ argv }) => {
    if (argv[0] === "node") return envelope({ stdout: "v20.19.0" });
    if (argv[0] === "npm" && argv[1] === "--version") return envelope({ stdout: "10.8.2" });
    if (argv[0] === "openspec") return envelope({ outcome: "spawn_error" });
    return envelope({ exitCode: 1, stderr: secret });
  };
  const value = await provision({ approval: approval(), projectRoot: directory, runtime: "codex", policy, commandRunner: runner });
  assertClosed(value);
  assert.equal(value.error_code, "INSTALL_FAILED");
  assert.equal(JSON.stringify(value).includes(secret), false);
}));

if (failures.length) {
  console.error(`${failures.length} OpenSpec adapter checks failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
