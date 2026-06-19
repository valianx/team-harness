// hooks/ts/bodies/precompact-snapshot.ts
// Canonical body — port of hooks/precompact-snapshot.sh PreCompact snapshot writer.
//
// CONTRACT:
//   - NEVER emits stdout (no permissionDecision envelope).
//   - ALWAYS succeeds (fail-open on every error).
//   - Copies 00-state.md → 00-state.precompact-snapshot.md (rolling, not growing).
//   - Appends one JSONL breadcrumb to 00-precompact.jsonl.
//   - Profile gate: suppressed under TH_HOOK_PROFILE=minimal (pipeline-observability class).
//   - Symlink guard: the resolved destination path must remain under the validated workspace base.
//
// The body exposes a PrecompactWriter interface for testability.
// The CC entry injects a real filesystem writer; tests inject a mock.
//
// IMPORTS hook-profile: YES. This is an observability hook — the hook-profile
// helper is sourced ONLY by observability/notification bodies.

import { observabilityEnabled } from "./hook-profile.js";
import type { NormalizedInput } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// PrecompactWriter — injected by the entry module.
// ---------------------------------------------------------------------------

export interface PrecompactWriter {
  /** Locate the active workspace directory. Returns null if not found. */
  findWorkspace(cwd: string): string | null;
  /** Read a file. Returns null on any error. */
  readFile(path: string): string | null;
  /** Write content to file atomically (overwrite). Returns null on success, error message on failure. */
  writeFile(path: string, content: string): string | null;
  /** Append a JSONL line to a file. Returns null on success, error message on failure. */
  appendLine(path: string, jsonLine: string): string | null;
  /** Resolve the real canonical path (resolves symlinks). Returns null on error. */
  realpath(path: string): string | null;
  /** Join path components. */
  join(...parts: string[]): string;
  /** Return current ISO-8601 timestamp. */
  now(): string;
  /** Current working directory. */
  cwd(): string;
}

// ---------------------------------------------------------------------------
// Filename constants.
// ---------------------------------------------------------------------------

const STATE_FILE = "00-state.md";
const SNAPSHOT_FILE = "00-state.precompact-snapshot.md";
const BREADCRUMB_FILE = "00-precompact.jsonl";

// ---------------------------------------------------------------------------
// Symlink guard — ensures the destination stays within the workspace base.
// Returns true if safe, false if the resolved path escapes.
// ---------------------------------------------------------------------------

function symlinkSafe(writer: PrecompactWriter, workspace: string, targetPath: string): boolean {
  const real = writer.realpath(workspace);
  if (real === null) return false; // cannot verify workspace → block

  const resolvedTarget = writer.realpath(targetPath);
  if (resolvedTarget === null) {
    // Target doesn't exist yet (new file). The workspace itself must be safe.
    // We can only check that the workspace is real.
    return true; // no symlink to follow on a non-existent target
  }

  // The resolved target must start with the real workspace path.
  return resolvedTarget.startsWith(real);
}

// ---------------------------------------------------------------------------
// evaluatePrecompactSnapshot() — main body function.
// Returns null on success or silent skip, error string on failure (always fail-open).
// ---------------------------------------------------------------------------

export function evaluatePrecompactSnapshot(
  _input: NormalizedInput,
  writer: PrecompactWriter
): null | string {
  try {
    // Profile gate (pipeline-observability class).
    if (!observabilityEnabled("pipeline-observability")) {
      return null; // suppressed
    }

    const cwd = writer.cwd();
    const workspace = writer.findWorkspace(cwd);
    if (workspace === null) {
      return null; // no active workspace → skip silently
    }

    const statePath = writer.join(workspace, STATE_FILE);
    const snapshotPath = writer.join(workspace, SNAPSHOT_FILE);
    const breadcrumbPath = writer.join(workspace, BREADCRUMB_FILE);

    // Read the current 00-state.md.
    const stateContent = writer.readFile(statePath);
    if (stateContent === null) {
      return null; // no state file → skip silently (fail-open)
    }

    // Symlink guard on the snapshot destination.
    if (!symlinkSafe(writer, workspace, snapshotPath)) {
      return "precompact-snapshot: symlink guard triggered — snapshot destination escapes workspace (precompact-snapshot.ts)";
    }

    // Write the snapshot (rolling overwrite).
    const writeErr = writer.writeFile(snapshotPath, stateContent);
    if (writeErr !== null) {
      return `precompact-snapshot: failed to write snapshot: ${writeErr}`;
    }

    // Append breadcrumb to 00-precompact.jsonl.
    const record: Record<string, string> = {
      ts: writer.now(),
      event: "precompact.snapshot",
      workspace,
      snapshot: snapshotPath,
    };
    const jsonLine = JSON.stringify(record);
    const appendErr = writer.appendLine(breadcrumbPath, jsonLine);
    if (appendErr !== null) {
      // Breadcrumb failure is non-fatal — snapshot already written.
      return null;
    }

    return null; // success
  } catch (err: unknown) {
    // Fail-open on any unexpected exception.
    const msg = err instanceof Error ? err.message : String(err);
    return `precompact-snapshot: unexpected error (${msg})`;
  }
}
