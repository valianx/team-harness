// hooks/ts/bodies/notify-stage.ts
// Canonical body — port of hooks/notify-stage.sh stage-toast router.
//
// CONTRACT:
//   - NEVER emits a permissionDecision (never blocks).
//   - ALWAYS succeeds (exit 0 on every path).
//   - Profile gate: suppressed under TH_HOOK_PROFILE=minimal (idle-notify class).
//   - Invoked by the orchestrator at stage boundaries (not a CC PreToolUse hook).
//
// NOTIFY-STAGE IS SPECIAL: it is NOT a CC hook — it is orchestrator-invoked.
// There is no CC entry for it in config.json. The CC entry is a no-op stub.
// The opencode entry routes to OS notification scripts.
//
// The body exposes a NotifyStageRunner interface for testability.
//
// IMPORTS hook-profile: YES. This is a notification hook — the hook-profile
// helper is sourced ONLY by observability/notification bodies.

import { observabilityEnabled } from "./hook-profile.js";

// ---------------------------------------------------------------------------
// NotifyStagePayload — the JSON structure piped from the orchestrator.
// ---------------------------------------------------------------------------

export interface NotifyStagePayload {
  stage?: number | string;
  label?: string;
  status?: string;
  feature?: string;
  summary?: string;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// NotifyStageRunner — injected by the caller.
// ---------------------------------------------------------------------------

export interface NotifyStageRunner {
  /** Run a sub-notify script. Returns null on success, error message on failure. */
  runNotify(scriptPath: string, message: string, cwd: string): string | null;
  /** Detect the OS. Returns "windows" | "mac" | "linux" | "unknown". */
  detectOS(): "windows" | "mac" | "linux" | "unknown";
  /** Resolve the hooks directory path. */
  hooksDir(): string;
}

// ---------------------------------------------------------------------------
// buildMessage() — mirrors the MESSAGE construction in notify-stage.sh.
// Summary is capped at 120 characters.
// ---------------------------------------------------------------------------

function buildMessage(payload: NotifyStagePayload): string {
  const feature = String(payload.feature ?? "").slice(0, 100);
  const stage = String(payload.stage ?? "");
  const label = String(payload.label ?? "");
  const status = String(payload.status ?? "complete");
  const summary = String(payload.summary ?? "").slice(0, 120);
  return `Pipeline ${feature} · Stage ${stage} (${label}) ${status} — ${summary}`;
}

// ---------------------------------------------------------------------------
// notifyScript() — maps OS to the matching notify-{os}.sh script.
// Returns null for unknown OS (exit-0 silently).
// ---------------------------------------------------------------------------

function notifyScript(runner: NotifyStageRunner): string | null {
  const os = runner.detectOS();
  const dir = runner.hooksDir();
  switch (os) {
    case "windows": return `${dir}/notify-windows.sh`;
    case "mac":     return `${dir}/notify-mac.sh`;
    case "linux":   return `${dir}/notify-linux.sh`;
    default:        return null;
  }
}

// ---------------------------------------------------------------------------
// evaluateNotifyStage() — main body function.
// Returns null on success/skip, error string on failure (always fail-open).
// ---------------------------------------------------------------------------

export function evaluateNotifyStage(
  payload: NotifyStagePayload,
  runner: NotifyStageRunner
): null | string {
  try {
    // Profile gate (idle-notify class).
    if (!observabilityEnabled("idle-notify")) {
      return null; // suppressed
    }

    const script = notifyScript(runner);
    if (script === null) {
      return null; // unknown OS → exit 0 silently
    }

    const message = buildMessage(payload);
    const cwd = String(payload.cwd ?? "");

    // Run the downstream notify script.
    const err = runner.runNotify(script, message, cwd);
    if (err !== null) {
      // Non-fatal: notification failure never blocks anything.
      return null;
    }

    return null; // success
  } catch {
    // Fail-open on any unexpected exception.
    return null;
  }
}
