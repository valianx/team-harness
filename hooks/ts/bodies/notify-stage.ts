// hooks/ts/bodies/notify-stage.ts
// Canonical body — native TS port of the former notify-stage.sh +
// notify-{windows,mac,linux}.sh family (hook cutover, issue #446). Sends the
// OS-native notification directly (no shell-out to a sibling script) — the
// per-platform branching that used to live in three separate Bash files now
// lives in the entry's NotifyStageRunner implementation.
//
// CONTRACT:
//   - NEVER emits a permissionDecision (never blocks).
//   - ALWAYS succeeds (exit 0 on every path).
//   - Profile gate: suppressed under TH_HOOK_PROFILE=minimal (idle-notify class).
//   - Invoked by the orchestrator at stage boundaries (its own Bash tool call,
//     piping a JSON payload — not a CC hook event) AND wired as the plugin's
//     Notification/idle_prompt hook.
//
// The body exposes a NotifyStageRunner interface for testability — the CC
// entry supplies the real OS-detection + native-notification implementation.
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
  /** Send a native OS notification. Returns null on success, error message on failure. */
  sendNotification(title: string, body: string): string | null;
  /** Detect the OS. Returns "windows" | "mac" | "linux" | "unknown". */
  detectOS(): "windows" | "mac" | "linux" | "unknown";
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
// buildTitle() — mirrors the TITLE construction shared by the former
// notify-{windows,mac,linux}.sh scripts: "Claude Code — <project>", where
// <project> is the basename of the payload's cwd.
// ---------------------------------------------------------------------------

function buildTitle(cwd: string): string {
  const project = cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return `Claude Code — ${project}`;
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

    const os = runner.detectOS();
    if (os === "unknown") {
      return null; // unrecognized OS → exit 0 silently
    }

    const message = buildMessage(payload);
    const cwd = String(payload.cwd ?? "");
    const title = buildTitle(cwd);
    const body = message.slice(0, 300) || "Waiting for input";

    // Send the native notification.
    const err = runner.sendNotification(title, body);
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
