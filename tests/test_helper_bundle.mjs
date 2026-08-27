#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  HELPER_COMPATIBILITY_EPOCH,
  PIPELINE_HELPERS,
  materializeHelperBundle,
  verifyHelperBundle,
} from "../skills/pipeline/scripts/helper-bundle.mjs";

const root = await mkdtemp(path.join(tmpdir(), "th-helper-bundle-"));
try {
  const workspace = path.join(root, "workspace");
  const sourceRoot = path.join(root, "cache", "scripts");
  await mkdir(workspace, { recursive: true });
  await mkdir(sourceRoot, { recursive: true });
  for (const helper of PIPELINE_HELPERS) await writeFile(path.join(sourceRoot, helper), `// ${helper}\n`);

  const materialized = await materializeHelperBundle({ workspace, source_root: sourceRoot });
  assert.equal(materialized.verdict, "pass");
  assert.equal(materialized.compatibility_epoch, HELPER_COMPATIBILITY_EPOCH);
  assert.match(materialized.bundle_identity_sha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.keys(materialized.helper_paths).length, PIPELINE_HELPERS.length);
  assert.ok(materialized.helper_paths["test-transition.mjs"].startsWith(workspace));

  const repeated = await materializeHelperBundle({ workspace, source_root: sourceRoot });
  assert.equal(repeated.verdict, "pass");
  assert.equal(repeated.bundle_identity_sha256, materialized.bundle_identity_sha256);
  assert.equal(repeated.manifest_sha256, materialized.manifest_sha256);

  const removedCache = path.join(root, "removed-cache");
  await rename(path.join(root, "cache"), removedCache);
  const verifiedWithoutCache = await verifyHelperBundle({
    workspace,
    manifest_path: materialized.manifest_path,
    manifest_sha256: materialized.manifest_sha256,
  });
  assert.equal(verifiedWithoutCache.verdict, "pass");
  assert.deepEqual(verifiedWithoutCache.helper_paths, materialized.helper_paths);

  const boundedPath = verifiedWithoutCache.helper_paths["bounded-command.mjs"];
  await chmod(boundedPath, 0o600);
  await writeFile(boundedPath, "// tampered\n");
  const tampered = await verifyHelperBundle({
    workspace,
    manifest_path: materialized.manifest_path,
    manifest_sha256: materialized.manifest_sha256,
  });
  assert.equal(tampered.verdict, "fail");
  assert.equal(tampered.error_code, "BUNDLE_STALE");

  const symlinkWorkspace = path.join(root, "symlink-workspace");
  await symlink(workspace, symlinkWorkspace, process.platform === "win32" ? "junction" : "dir");
  const rejected = await verifyHelperBundle({
    workspace: symlinkWorkspace,
    manifest_path: materialized.manifest_path,
    manifest_sha256: materialized.manifest_sha256,
  });
  assert.equal(rejected.error_code, "WORKSPACE_INVALID");

  const escapingWorkspace = path.join(root, "escaping-workspace");
  const externalInputs = path.join(root, "external-inputs");
  await mkdir(escapingWorkspace);
  await mkdir(externalInputs);
  await symlink(externalInputs, path.join(escapingWorkspace, "inputs"), process.platform === "win32" ? "junction" : "dir");
  const escapedWrite = await materializeHelperBundle({ workspace: escapingWorkspace, source_root: removedCache + "/scripts" });
  assert.equal(escapedWrite.verdict, "fail");
  assert.equal(escapedWrite.error_code, "BUNDLE_WRITE_FAILED");

  const actualWorkspace = path.join(root, "actual-workspace");
  const actualSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills/pipeline/scripts");
  await mkdir(actualWorkspace);
  const actual = await materializeHelperBundle({ workspace: actualWorkspace, source_root: actualSource });
  assert.equal(actual.verdict, "pass");
  const bundledPreflight = await import(pathToFileURL(actual.helper_paths["correction-packet-preflight.mjs"]).href);
  assert.equal(typeof bundledPreflight.certifyCorrectionPacket, "function");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("pipeline helper bundle: PASS");
