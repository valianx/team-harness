import { isDeepStrictEqual } from "node:util";

const FILE_MODES = ["local", "obsidian"];
const MODES = [...FILE_MODES, "gpt-space"];

/** Select the authoritative workspace preference without loading file identity or changing configuration. */
export function selectWorkspacePreference(config = {}) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return { status: "invalid", mode: null, selected_from: "default", conflict: false, reason_code: "invalid_configuration" };
  }
  const canonical = Object.hasOwn(config, "workspace-mode");
  const legacy = Object.hasOwn(config, "logs-mode");
  const selected_from = canonical ? "workspace-mode" : legacy ? "logs-mode" : "default";
  const mode = selected_from === "default" ? "local" : config[selected_from];
  const conflict = canonical && legacy && !isDeepStrictEqual(config["workspace-mode"], config["logs-mode"]);
  if (!(canonical ? MODES : FILE_MODES).includes(mode)) {
    return { status: "invalid", mode: null, selected_from, conflict,
      reason_code: canonical ? "invalid_workspace_mode" : "invalid_logs_mode" };
  }
  return { status: "selected", mode, selected_from, conflict, reason_code: conflict ? "selector_conflict" : null };
}
