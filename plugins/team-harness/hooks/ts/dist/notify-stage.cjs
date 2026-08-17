"use strict";

// entry/notify-stage.cc.ts
var import_node_child_process = require("node:child_process");

// bodies/hook-profile.ts
function getHookProfile() {
  const val = (typeof process !== "undefined" ? process.env["TH_HOOK_PROFILE"] : void 0) ?? "";
  if (val === "minimal" || val === "standard" || val === "strict") {
    return val;
  }
  return "standard";
}
function observabilityEnabled(cls) {
  const profile = getHookProfile();
  if (profile === "minimal") {
    if (cls === "idle-notify" || cls === "pipeline-observability") {
      return false;
    }
    return true;
  }
  return true;
}

// bodies/notify-stage.ts
function hasStageFields(payload) {
  return [
    payload.feature,
    payload.stage,
    payload.label,
    payload.status,
    payload.summary
  ].some((field) => String(field ?? "").trim() !== "");
}
function buildMessage(payload) {
  if (!hasStageFields(payload)) {
    return "";
  }
  const feature = String(payload.feature ?? "").slice(0, 100);
  const stage = String(payload.stage ?? "");
  const label = String(payload.label ?? "");
  const status = String(payload.status ?? "complete");
  const summary = String(payload.summary ?? "").slice(0, 120);
  return `Pipeline ${feature} \xB7 Stage ${stage} (${label}) ${status} \u2014 ${summary}`;
}
function buildTitle(cwd) {
  const project = cwd.split(/[\\/]/).filter(Boolean).pop();
  return project ? `Claude Code \u2014 ${project}` : "Claude Code";
}
function evaluateNotifyStage(payload, runner) {
  try {
    if (!observabilityEnabled("idle-notify")) {
      return null;
    }
    const os = runner.detectOS();
    if (os === "unknown") {
      return null;
    }
    const message = buildMessage(payload);
    const cwd = String(payload.cwd ?? "");
    const title = buildTitle(cwd);
    const body = message.slice(0, 300) || "Waiting for input";
    const err = runner.sendNotification(title, body);
    if (err !== null) {
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

// entry/notify-stage.cc.ts
function detectOS() {
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
function sendLinux(title, body) {
  try {
    (0, import_node_child_process.execFileSync)("notify-send", ["-a", "Claude Code", "-u", "normal", title, body], {
      timeout: 5e3,
      stdio: "ignore"
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
function sendMac(title, body) {
  try {
    const escape = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `display notification "${escape(body)}" with title "${escape(title)}"`;
    (0, import_node_child_process.execFileSync)("osascript", [], { input: script, timeout: 5e3, stdio: ["pipe", "ignore", "ignore"] });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
function sendWindows(title, body) {
  try {
    const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const psEscape = (s) => s.replace(/'/g, "''");
    const psTitle = psEscape(xmlEscape(title));
    const psBody = psEscape(xmlEscape(body.slice(0, 200)));
    const aumid = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
    const command = `
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
  $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
  $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${psTitle}</text><text>${psBody}</text></binding></visual></toast>')
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${aumid}').Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;
    (0, import_node_child_process.execFileSync)("powershell.exe", ["-NoProfile", "-Command", command], {
      timeout: 5e3,
      stdio: "ignore"
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
function makeRunner() {
  return {
    detectOS,
    sendNotification(title, body) {
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
    }
  };
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function main() {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  try {
    evaluateNotifyStage(payload, makeRunner());
  } catch {
  }
}
main().catch(() => {
  process.exit(0);
});
