// hooks/ts/entry/notify-stage.cc.ts
// Claude Code (Node) entry for notify-stage — the stage-boundary OS toast.
//
// Two call sites:
//   1. The orchestrator's own Bash tool invokes this directly at each of the
//      4 pipeline stage boundaries, piping a {"stage",...} JSON payload.
//   2. The plugin wires it as the Notification/idle_prompt hook via
//      hooks/run-ts-hook.sh notify-stage.
//
// Reads stdin → JSON.parse → evaluateNotifyStage(payload, runner). The
// runner sends the OS-native notification directly (no shell-out to a
// sibling script — this replaces the former notify-{windows,mac,linux}.sh
// trio). Uses execFileSync (argv-based, no shell) for every platform command,
// which is the injection-safe equivalent of the Bash originals' printf-pipe
// (macOS) and doubled-quote (Windows) escaping.
//
// NEVER emits stdout. NEVER blocks. Exit 0 always (fail-open).

import { execFileSync } from "node:child_process";
import {
  evaluateNotifyStage,
  type NotifyStagePayload,
  type NotifyStageRunner,
} from "../bodies/notify-stage.js";

// ---------------------------------------------------------------------------
// OS detection — mirrors the $OSTYPE / uname -s branch table in the retired
// notify-stage.sh. Unknown OS is a closed branch (no toast, no error).
// ---------------------------------------------------------------------------

function detectOS(): "windows" | "mac" | "linux" | "unknown" {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "mac";
    case "linux":
      return "linux";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Per-platform native senders. Each mirrors the retired notify-{os}.sh body.
// ---------------------------------------------------------------------------

function sendLinux(title: string, body: string): string | null {
  try {
    execFileSync("notify-send", ["-a", "Claude Code", "-u", "normal", title, body], {
      timeout: 5000,
      stdio: "ignore",
    });
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

function sendMac(title: string, body: string): string | null {
  try {
    // Escape backslashes and double quotes for the AppleScript string literal
    // (same escaping as the retired notify-mac.sh). Piped via stdin to
    // osascript — never interpolated into a shell -e string (SEC-005).
    const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `display notification "${escape(body)}" with title "${escape(title)}"`;
    execFileSync("osascript", [], { input: script, timeout: 5000, stdio: ["pipe", "ignore", "ignore"] });
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

function sendWindows(title: string, body: string): string | null {
  try {
    // Double single-quotes for PowerShell single-quoted string literals
    // (SEC-004 — the correct escape; a bare backslash-escape is invalid
    // PowerShell syntax). Body capped at 200 chars, same as the original.
    const psEscape = (s: string) => s.replace(/'/g, "''");
    const psTitle = psEscape(title);
    const psBody = psEscape(body.slice(0, 200));
    const aumid = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
    const command = `
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
  $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
  $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${psTitle}</text><text>${psBody}</text></binding></visual></toast>')
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${aumid}').Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;
    execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
      timeout: 5000,
      stdio: "ignore",
    });
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}

function makeRunner(): NotifyStageRunner {
  return {
    detectOS,
    sendNotification(title: string, body: string): string | null {
      switch (detectOS()) {
        case "linux":
          return sendLinux(title, body);
        case "mac":
          return sendMac(title, body);
        case "windows":
          return sendWindows(title, body);
        default:
          return null;
      }
    },
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let payload: NotifyStagePayload = {};
  try {
    payload = JSON.parse(raw) as NotifyStagePayload;
  } catch {
    // Malformed payload — fail-open, nothing to notify.
    return;
  }

  try {
    evaluateNotifyStage(payload, makeRunner());
  } catch {
    // Fail-open on any unexpected exception.
  }
}

main().catch(() => {
  process.exit(0);
});
