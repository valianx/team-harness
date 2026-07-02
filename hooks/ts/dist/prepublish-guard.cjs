"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// entry/prepublish-guard.cc.ts
var fs = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);
var os = __toESM(require("node:os"), 1);
var import_node_child_process = require("node:child_process");

// shim/normalized-v1.ts
var MAX_PAYLOAD_BYTES = 1048576;
var MAX_NESTING_DEPTH = 64;
var VALID_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "SubagentStop",
  "PreCompact",
  "Notification",
  "Task"
]);

// shim/shim.ts
var ShimRejectError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ShimRejectError";
  }
};
function checkSize(raw) {
  const byteLen = typeof Buffer !== "undefined" ? Buffer.byteLength(raw, "utf8") : new TextEncoder().encode(raw).byteLength;
  if (byteLen > MAX_PAYLOAD_BYTES) {
    throw new ShimRejectError(
      `SEC-07: payload exceeds max size (${byteLen} bytes > ${MAX_PAYLOAD_BYTES})`
    );
  }
}
function checkDepth(raw) {
  let depth = 0;
  let inString = false;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
      if (depth > MAX_NESTING_DEPTH) {
        throw new ShimRejectError(
          `SEC-07: payload nesting depth exceeds max (${depth} > ${MAX_NESTING_DEPTH})`
        );
      }
    } else if (ch === "}" || ch === "]") {
      depth--;
    }
    i++;
  }
}
function rejectPollutionKeys(obj) {
  const dangerous = ["__proto__", "constructor", "prototype"];
  for (const key of dangerous) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new ShimRejectError(
        `SEC-07: payload contains forbidden key '${key}' (prototype-pollution attempt)`
      );
    }
  }
}
function buildNormalized(parsed, runtime) {
  const rawEvent = parsed["event"];
  if (typeof rawEvent !== "string" || !VALID_EVENTS.has(rawEvent)) {
    throw new ShimRejectError(
      `SEC-07: 'event' must be a valid event string, got ${typeof rawEvent}`
    );
  }
  const event = rawEvent;
  let tool = null;
  const rawTool = parsed["tool"];
  if (rawTool !== void 0 && rawTool !== null) {
    if (typeof rawTool !== "object" || Array.isArray(rawTool)) {
      throw new ShimRejectError("SEC-07: 'tool' must be an object or absent");
    }
    const toolObj = rawTool;
    rejectPollutionKeys(toolObj);
    const rawName = toolObj["name"];
    if (typeof rawName !== "string") {
      throw new ShimRejectError("SEC-07: 'tool.name' must be a string");
    }
    const rawInput = toolObj["input"];
    const toolInput = rawInput !== void 0 && rawInput !== null && typeof rawInput === "object" && !Array.isArray(rawInput) ? rawInput : {};
    tool = { name: rawName, input: toolInput };
  }
  const rawWorkspace = parsed["workspace"];
  if (rawWorkspace !== void 0 && rawWorkspace !== null && typeof rawWorkspace !== "string") {
    throw new ShimRejectError("SEC-07: 'workspace' must be a string or absent");
  }
  const workspace = typeof rawWorkspace === "string" ? rawWorkspace : null;
  const rawDataHome = parsed["dataHome"];
  if (rawDataHome !== void 0 && rawDataHome !== null && typeof rawDataHome !== "string") {
    throw new ShimRejectError("SEC-07: 'dataHome' must be a string or absent");
  }
  const dataHome = typeof rawDataHome === "string" ? rawDataHome : null;
  return { event, tool, workspace, runtime, dataHome };
}
function parseCCPayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShimRejectError("SEC-07: payload is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ShimRejectError("SEC-07: payload must be a JSON object");
  }
  const obj = parsed;
  rejectPollutionKeys(obj);
  const toolName = obj["tool_name"];
  const toolInput = obj["tool_input"];
  const normalized = {
    event: "PreToolUse",
    // CC hook event for this payload shape
    tool: typeof toolName === "string" ? {
      name: toolName,
      input: typeof toolInput === "object" && toolInput !== null && !Array.isArray(toolInput) ? toolInput : {}
    } : null,
    workspace: obj["workspace"] ?? null,
    dataHome: obj["dataHome"] ?? null
  };
  return normalized;
}
function inboundCC(raw) {
  checkSize(raw);
  checkDepth(raw);
  const mapped = parseCCPayload(raw);
  return buildNormalized(mapped, "claude-code");
}
function outboundCC(d) {
  if (d.decision === "none") {
    process.stdout.write("");
    process.exit(0);
  }
  const payload = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: d.decision,
      permissionDecisionReason: d.reason
    }
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
  process.exit(0);
}

// bodies/prepublish-guard.ts
function deny(reason) {
  return { decision: "deny", reason, mutations: null };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
var GIT_PUSH_RE = /(^|[\s|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)/;
var GH_PR_CREATE_RE = /(^|[\s|;`])gh\s+pr\s+create(\s|$)/;
var CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
function runVersionBumpCheck(reader) {
  if (!reader.fileExists(".claude-plugin/plugin.json")) {
    return null;
  }
  const changed = reader.gitDiffOriginMain();
  if (changed === null) {
    return null;
  }
  const touchesAssets = changed.some((f) => /^(agents|skills|hooks)\//.test(f));
  if (!touchesAssets) {
    return null;
  }
  const pluginContent = reader.readFile(".claude-plugin/plugin.json");
  const marketContent = reader.readFile(".claude-plugin/marketplace.json");
  let pluginHead = "";
  let marketHead = "";
  if (pluginContent) {
    try {
      const obj = JSON.parse(pluginContent);
      pluginHead = typeof obj["version"] === "string" ? obj["version"] : "";
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (marketContent) {
    try {
      const obj = JSON.parse(marketContent);
      const plugins = obj["plugins"];
      if (Array.isArray(plugins) && plugins.length > 0) {
        const first = plugins[0];
        marketHead = typeof first["version"] === "string" ? first["version"] : "";
      }
    } catch {
      return null;
    }
  } else {
    return null;
  }
  const pluginOriginJson = reader.gitShow("origin/main:.claude-plugin/plugin.json");
  let pluginOrigin = "";
  if (pluginOriginJson !== null) {
    try {
      const obj = JSON.parse(pluginOriginJson);
      pluginOrigin = typeof obj["version"] === "string" ? obj["version"] : "";
    } catch {
      return null;
    }
  }
  const marketOriginJson = reader.gitShow("origin/main:.claude-plugin/marketplace.json");
  let marketOrigin = "";
  if (marketOriginJson !== null) {
    try {
      const obj = JSON.parse(marketOriginJson);
      const plugins = obj["plugins"];
      if (Array.isArray(plugins) && plugins.length > 0) {
        const first = plugins[0];
        marketOrigin = typeof first["version"] === "string" ? first["version"] : "";
      }
    } catch {
      return null;
    }
  }
  const pluginBumped = pluginHead && pluginOrigin && pluginHead !== pluginOrigin || pluginHead && !pluginOrigin;
  const marketBumped = marketHead && marketOrigin && marketHead !== marketOrigin || marketHead && !marketOrigin;
  if (!pluginBumped || !marketBumped) {
    return deny(
      'prepublish-guard: distributed assets (agents/|skills/|hooks/) changed but the plugin version was not bumped. Bump "version" in BOTH .claude-plugin/plugin.json AND .claude-plugin/marketplace.json (matched semver) in this push, or the marketplace serves nothing (CLAUDE.md \xA76.3). Push blocked.'
    );
  }
  return null;
}
function runPrepublishCheck(reader) {
  const config = reader.readConfig();
  if (config === null) return null;
  const checkCmd = typeof config["prepublish_check"] === "string" ? config["prepublish_check"] : "";
  if (!checkCmd) return null;
  if (CONTROL_CHAR_RE.test(checkCmd)) {
    return null;
  }
  const result = reader.runCommand("bash", ["-lc", checkCmd], 9e4);
  const rc = result.exitCode;
  if (rc === 0) return null;
  if (rc === 124 || rc === 127) return null;
  const escapedCmd = reader.jsonEscape(checkCmd);
  return deny(
    `prepublish-guard: the declared prepublish_check failed (exit ${rc}). Command: ${escapedCmd}. Fix the failing tests before opening the PR, or clear the prepublish_check key to bypass. PR creation blocked.`
  );
}
function evaluate(input, reader) {
  const cmd = typeof input.tool?.input?.["command"] === "string" ? input.tool.input["command"] : "";
  if (!cmd) return none();
  const isGitPush = GIT_PUSH_RE.test(cmd);
  const isGhPrCreate = GH_PR_CREATE_RE.test(cmd);
  if (!isGitPush && !isGhPrCreate) return none();
  if (isGitPush) {
    const result = runVersionBumpCheck(reader);
    return result ?? none();
  }
  if (isGhPrCreate) {
    const result = runPrepublishCheck(reader);
    return result ?? none();
  }
  return none();
}

// entry/prepublish-guard.cc.ts
function makeReader() {
  return {
    readFile(filePath) {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },
    runCommand(cmd, args, timeoutMs) {
      try {
        const stdout = (0, import_node_child_process.execFileSync)(cmd, args, { timeout: timeoutMs, encoding: "utf8" });
        return { stdout, exitCode: 0 };
      } catch (err) {
        if (err && typeof err === "object" && "status" in err) {
          const e = err;
          return { stdout: String(e.stdout ?? ""), exitCode: e.status ?? 1 };
        }
        if (err && typeof err === "object" && "code" in err) {
          const e = err;
          if (e.code === "ETIMEDOUT") return { stdout: "", exitCode: 124 };
        }
        return { stdout: "", exitCode: 1 };
      }
    },
    fileExists(filePath) {
      try {
        fs.accessSync(filePath);
        return true;
      } catch {
        return false;
      }
    },
    readConfig() {
      try {
        const configPath = path.join(os.homedir(), ".claude", ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    gitDiffOriginMain() {
      try {
        const out = (0, import_node_child_process.execFileSync)("git", ["diff", "--name-only", "origin/main...HEAD"], {
          encoding: "utf8",
          env: { ...process.env, MSYS_NO_PATHCONV: "1" }
        });
        return out.split("\n").map((l) => l.trim()).filter(Boolean);
      } catch {
        return null;
      }
    },
    gitShow(ref) {
      try {
        return (0, import_node_child_process.execFileSync)("git", ["show", ref], {
          encoding: "utf8",
          env: { ...process.env, MSYS_NO_PATHCONV: "1" }
        });
      } catch {
        return null;
      }
    },
    jsonEscape(s) {
      return JSON.stringify(s);
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
  const reader = makeReader();
  try {
    const normalized = inboundCC(raw);
    const decision = evaluate(normalized, reader);
    outboundCC(decision);
  } catch (err) {
    if (err instanceof ShimRejectError) {
      const fallback = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    } else {
      const fallback = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    }
  }
}
main().catch(() => {
  process.exit(0);
});
