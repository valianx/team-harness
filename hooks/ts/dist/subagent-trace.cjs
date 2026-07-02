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

// entry/subagent-trace.cc.ts
var fs = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);

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

// bodies/subagent-trace.ts
var TRACE_FILENAME = "00-subagent-trace.jsonl";
function isTHAgent(agentType) {
  return agentType.startsWith("th:");
}
function writeTrace(input, writer) {
  const agentType = typeof input.tool?.input?.["agent_type"] === "string" ? input.tool.input["agent_type"] : "";
  if (!agentType || !isTHAgent(agentType)) {
    return null;
  }
  const stopReason = typeof input.tool?.input?.["stop_reason"] === "string" ? input.tool.input["stop_reason"] : "";
  const ts = writer.now();
  const cwd = writer.cwd();
  const workspace = writer.findWorkspace(cwd);
  if (workspace === null) {
    return null;
  }
  const record = {
    ts,
    event: "subagent.stop",
    agent_type: agentType,
    stop_reason: stopReason,
    workspace
  };
  const jsonLine = JSON.stringify(record);
  return writer.appendLine(workspace, TRACE_FILENAME + "\0" + jsonLine);
}
function evaluateSubagentTrace(input, writer) {
  try {
    return writeTrace(input, writer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `subagent-trace: unexpected error (${msg})`;
  }
}

// entry/subagent-trace.cc.ts
function findWorkspace(cwd) {
  const workspacesDir = path.join(cwd, "workspaces");
  if (fs.existsSync(workspacesDir)) {
    try {
      const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      let latest = null;
      for (const d of dirs) {
        const statePath = path.join(workspacesDir, d.name, "00-state.md");
        try {
          const stat = fs.statSync(statePath);
          if (latest === null || stat.mtimeMs > latest.mtime) {
            latest = { dir: path.join(workspacesDir, d.name), mtime: stat.mtimeMs };
          }
        } catch {
        }
      }
      if (latest !== null) return latest.dir;
    } catch {
    }
  }
  const envWs = process.env["TH_WORKSPACE"];
  if (envWs && fs.existsSync(path.join(envWs, "00-state.md"))) {
    return envWs;
  }
  return null;
}
function makeWriter() {
  return {
    appendLine(workspacePath, encodedLine) {
      const sep = encodedLine.indexOf("\0");
      if (sep < 0) return "subagent-trace: invalid encodedLine format";
      const filename = encodedLine.slice(0, sep);
      const jsonLine = encodedLine.slice(sep + 1);
      const filePath = path.join(workspacePath, filename);
      try {
        fs.appendFileSync(filePath, jsonLine + "\n", "utf8");
        return null;
      } catch (err) {
        return `subagent-trace: append failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    findWorkspace(cwd) {
      return findWorkspace(cwd);
    },
    now() {
      return (/* @__PURE__ */ new Date()).toISOString();
    },
    cwd() {
      return process.cwd();
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
  const writer = makeWriter();
  try {
    const normalized = inboundCC(raw);
    evaluateSubagentTrace(normalized, writer);
  } catch (err) {
    if (err instanceof ShimRejectError) {
    }
  }
}
main().catch(() => {
  process.exit(0);
});
