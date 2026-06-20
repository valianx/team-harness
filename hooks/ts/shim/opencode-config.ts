// hooks/ts/shim/opencode-config.ts
// Shared opencode config-root resolver and config reader.
//
// Extracted from checkpoint-guard.opencode.ts and prepublish-guard.opencode.ts
// (byte-identical logic). Promoting to a shared module avoids triplication and
// ensures all three opencode entries (checkpoint-guard, prepublish-guard,
// session-enforcement) use the same hardened resolver (SEC-OC-R3).
//
// Security (SEC-OC-R3):
//   - OPENCODE_CONFIG_DIR override is validated before use: must be absolute
//     and must not contain ".." after path.normalize().
//   - Resolved path is never trusted for anything beyond reading the config file.
//   - Config parsing failures return null (fail-silent, never throw to caller).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// resolveOpencodeConfigRoot returns the opencode config root directory.
// Resolution order (mirrors the Go installer's opencodeGlobalConfigDir):
//   1. OPENCODE_CONFIG_DIR env override — validated (absolute, no traversal).
//   2. Windows: %APPDATA%\opencode
//   3. Linux/macOS: $XDG_CONFIG_HOME/opencode else ~/.config/opencode
//
// Returns null when the resolved path contains ".." or is not absolute
// (SEC-OC-R3 — rejects traversal/injection overrides).
export function resolveOpencodeConfigRoot(): string | null {
  // Check for an env override first (SEC-OC-R3: validate before use).
  const override = process.env["OPENCODE_CONFIG_DIR"];
  if (override) {
    const normalized = path.normalize(override);
    if (!path.isAbsolute(normalized) || normalized.includes("..")) {
      // Reject traversal or relative injection attempts.
      return null;
    }
    return normalized;
  }

  const isWindows = process.platform === "win32";
  if (isWindows) {
    const appdata = process.env["APPDATA"];
    if (!appdata) {
      return path.join(os.homedir(), "AppData", "Roaming", "opencode");
    }
    return path.join(appdata, "opencode");
  }

  // Linux / macOS: $XDG_CONFIG_HOME/opencode else ~/.config/opencode
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg && path.isAbsolute(xdg)) {
    return path.join(xdg, "opencode");
  }
  return path.join(os.homedir(), ".config", "opencode");
}

// readOpencodeConfig reads .team-harness.json from the resolved opencode
// config root and returns the parsed object. Returns null on any error:
//   - resolveOpencodeConfigRoot() returns null (traversal/injection rejected)
//   - File does not exist or is unreadable
//   - Content is not valid JSON
//   - Any other I/O or parse error
//
// This is the opencode-side config read (option b — P2 autonomy). The CC side
// reads from os.homedir()/.claude/.team-harness.json (unchanged).
export function readOpencodeConfig(): Record<string, unknown> | null {
  try {
    const configRoot = resolveOpencodeConfigRoot();
    if (!configRoot) {
      return null;
    }
    const configPath = path.join(configRoot, ".team-harness.json");
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
