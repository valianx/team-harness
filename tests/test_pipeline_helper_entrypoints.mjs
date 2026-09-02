#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "skills", "pipeline", "scripts");
const temporary = await mkdtemp(path.join(tmpdir(), "th-helper-entrypoints-"));

try {
  const bridgeRoot = path.join(temporary, "3.20.6");
  await symlink(sourceRoot, bridgeRoot, process.platform === "win32" ? "junction" : "dir");
  const names = (await readdir(sourceRoot)).filter(name => name.endsWith(".mjs")).sort();
  const guarded = [];
  for (const name of names) {
    const source = await readFile(path.join(sourceRoot, name), "utf8");
    if (source.includes("isDirectExecution(import.meta.url)")) guarded.push(name);
  }
  assert.ok(guarded.length >= 10, `expected every pipeline CLI helper to use the shared guard, found ${guarded.length}`);
  assert.ok(guarded.includes("quality-runner.mjs"));
  assert.ok(guarded.includes("workspace-identity.mjs"));

  const specialistControl = await import("../skills/pipeline/scripts/control-plane-specialist.mjs");
  for (const safeExport of ["controlIdentity", "createResultEnvelope", "validateCapabilityLease", "validateResultEnvelope", "verifyCapabilityCapsule"]) {
    assert.equal(typeof specialistControl[safeExport], "function", `${safeExport} is missing from the specialist-safe surface`);
  }
  for (const mainOnlyExport of ["appendControlEvent", "issueCapabilityLease", "acceptResultEnvelope", "rebuildControlProjections"]) {
    assert.equal(Object.hasOwn(specialistControl, mainOnlyExport), false, `${mainOnlyExport} leaked into the specialist-safe surface`);
  }

  for (const name of guarded) {
    const invoked = spawnSync(process.execPath, [path.join(bridgeRoot, name)], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    assert.notEqual(invoked.status, 0, `${name} silently accepted an invalid empty invocation`);
    assert.ok(`${invoked.stdout}${invoked.stderr}`.length > 0, `${name} returned no terminal diagnostic`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("pipeline helper absolute entrypoints: PASS");
