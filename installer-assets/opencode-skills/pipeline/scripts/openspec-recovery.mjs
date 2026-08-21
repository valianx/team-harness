#!/usr/bin/env node
/** Derive the next recoverable action for an interrupted OpenSpec Design transaction. */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { verifySnapshot } from "./openspec-snapshot.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const CHANGE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PASSES = new Set(["preflight", "provisioning", "planning", "snapshot", "overlay", "gate1-ready"]);
const PREFLIGHT = new Set(["pending", "ready", "provisionable", "blocked-prerequisite", "invalid-project"]);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const safeString = value => typeof value === "string" && value.length > 0 && !value.includes("\0");
const safeRelative = value => safeString(value) && !path.isAbsolute(value) && !value.replaceAll("\\", "/").split("/").includes("..");
const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

async function readWorkspaceFile(workspace, relative) {
  if (!safeRelative(relative)) throw new Error("unsafe");
  const target = path.resolve(workspace, relative);
  if (!contained(workspace, target)) throw new Error("unsafe");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("unsafe");
  const canonical = await realpath(target);
  if (!contained(workspace, canonical)) throw new Error("unsafe");
  return readFile(canonical);
}

function result(verdict, actionCode, nextAction = null, errorCode = null) {
  return {
    schema_version: 2,
    kind: "team_harness_openspec_recovery",
    verdict,
    error_code: errorCode,
    action_code: actionCode,
    requires_agent_dispatch: false,
    next_action: nextAction,
  };
}

export async function recoverOpenSpecDesign({ state, workspace, snapshotVerifier = verifySnapshot } = {}) {
  if (!state || typeof state !== "object" || !CHANGE.test(state.openspec_change ?? "")
    || !safeString(state.openspec_repository_root) || !PREFLIGHT.has(state.openspec_preflight)
    || !PASSES.has(state.openspec_design_pass) || !safeString(workspace)) {
    return result("blocked", null, null, "STATE_INVALID");
  }
  let root;
  try {
    root = await realpath(path.resolve(workspace));
    if (!(await lstat(root)).isDirectory()) throw new Error("workspace");
  } catch { return result("blocked", null, null, "WORKSPACE_INVALID"); }

  if (state.openspec_preflight === "blocked-prerequisite" || state.openspec_preflight === "invalid-project") {
    return result("blocked", "RESOLVE_PREFLIGHT", "resolve OpenSpec preflight blocker", "PREFLIGHT_BLOCKED");
  }
  if (state.openspec_design_pass === "preflight") return result("resume", "RUN_PREFLIGHT", "run OpenSpec preflight");
  if (state.openspec_design_pass === "provisioning") {
    return state.openspec_preflight === "provisionable"
      ? result("resume", "RESUME_PROVISIONING", "resume approved OpenSpec provisioning")
      : result("blocked", null, null, "STATE_INVALID");
  }
  if (state.openspec_preflight !== "ready") return result("blocked", null, null, "STATE_INVALID");
  if (state.openspec_design_pass === "planning") return result("resume", "RESUME_PLANNING", "resume upstream OpenSpec planning");
  if (state.openspec_design_pass === "snapshot") return result("resume", "CAPTURE_SNAPSHOT", "capture strict OpenSpec snapshot");

  const snapshotPath = state.openspec_snapshot_path;
  if (snapshotPath !== "inputs/openspec-snapshot.json" || !SHA256.test(state.openspec_snapshot_sha256 ?? "")) {
    return result("blocked", null, null, "SNAPSHOT_STATE_INVALID");
  }
  let snapshotBytes;
  try { snapshotBytes = await readWorkspaceFile(root, snapshotPath); }
  catch { return result("resume", "CAPTURE_SNAPSHOT", "capture strict OpenSpec snapshot", "SNAPSHOT_MISSING"); }
  if (hash(snapshotBytes) !== state.openspec_snapshot_sha256) return result("blocked", "RECONCILE_SOURCE", "reconcile changed OpenSpec source", "SNAPSHOT_STALE");
  const freshness = await snapshotVerifier({ snapshotPath: path.join(root, snapshotPath), phase: "pre-gate1" });
  if (freshness?.verdict !== "pass") return result("blocked", "RECONCILE_SOURCE", "reconcile changed OpenSpec source", "CANONICAL_SOURCE_CHANGED");

  if (state.openspec_design_pass === "overlay") {
    return result("resume", "DERIVE_OVERLAY", "rerun the mechanical OpenSpec overlay derivation with overwrite authorized for this recovery event — no architect dispatch");
  }
  if (state.openspec_overlay_path !== "plan/openspec-traceability.json" || !SHA256.test(state.openspec_overlay_sha256 ?? "")) {
    return result("blocked", null, null, "OVERLAY_STATE_INVALID");
  }
  let overlayBytes;
  try { overlayBytes = await readWorkspaceFile(root, state.openspec_overlay_path); }
  catch {
    return result(
      "resume",
      "DERIVE_OVERLAY",
      "rerun the mechanical OpenSpec overlay derivation with overwrite authorized for this recovery event — no architect dispatch",
      "OVERLAY_MISSING",
    );
  }
  if (hash(overlayBytes) !== state.openspec_overlay_sha256) return result("blocked", "REVALIDATE_OVERLAY", "revalidate OpenSpec execution overlay", "OVERLAY_STALE");
  return result("resume", "PRESENT_GATE_1", "present STAGE-GATE-1");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("openspec-recovery.mjs is a library helper; Main supplies bounded state directly.\n");
  process.exitCode = 2;
}
