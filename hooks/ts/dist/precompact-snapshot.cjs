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

// entry/precompact-snapshot.cc.ts
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

// bodies/precompact-snapshot.ts
var STATE_FILE = "00-state.md";
var SNAPSHOT_FILE = "00-state.precompact-snapshot.md";
var BREADCRUMB_FILE = "00-precompact.jsonl";
function symlinkSafe(writer, workspace, targetPath) {
  const real = writer.realpath(workspace);
  if (real === null) return false;
  const resolvedTarget = writer.realpath(targetPath);
  if (resolvedTarget === null) {
    return true;
  }
  return resolvedTarget.startsWith(real);
}
function evaluatePrecompactSnapshot(_input, writer) {
  try {
    if (!observabilityEnabled("pipeline-observability")) {
      return null;
    }
    const cwd = writer.cwd();
    const workspace = writer.findWorkspace(cwd);
    if (workspace === null) {
      return null;
    }
    const statePath = writer.join(workspace, STATE_FILE);
    const snapshotPath = writer.join(workspace, SNAPSHOT_FILE);
    const breadcrumbPath = writer.join(workspace, BREADCRUMB_FILE);
    const stateContent = writer.readFile(statePath);
    if (stateContent === null) {
      return null;
    }
    if (!symlinkSafe(writer, workspace, snapshotPath)) {
      return "precompact-snapshot: symlink guard triggered \u2014 snapshot destination escapes workspace (precompact-snapshot.ts)";
    }
    const writeErr = writer.writeFile(snapshotPath, stateContent);
    if (writeErr !== null) {
      return `precompact-snapshot: failed to write snapshot: ${writeErr}`;
    }
    const record = {
      ts: writer.now(),
      event: "precompact.snapshot",
      workspace,
      snapshot: snapshotPath
    };
    const jsonLine = JSON.stringify(record);
    const appendErr = writer.appendLine(breadcrumbPath, jsonLine);
    if (appendErr !== null) {
      return null;
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `precompact-snapshot: unexpected error (${msg})`;
  }
}

// entry/precompact-snapshot.cc.ts
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
    findWorkspace(cwd) {
      return findWorkspace(cwd);
    },
    readFile(filePath) {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },
    writeFile(filePath, content) {
      try {
        fs.writeFileSync(filePath, content, "utf8");
        return null;
      } catch (err) {
        return `writeFile failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    appendLine(filePath, jsonLine) {
      try {
        fs.appendFileSync(filePath, jsonLine + "\n", "utf8");
        return null;
      } catch (err) {
        return `appendLine failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    realpath(filePath) {
      try {
        return fs.realpathSync(filePath);
      } catch {
        return null;
      }
    },
    join(...parts) {
      return path.join(...parts);
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
    evaluatePrecompactSnapshot(normalized, writer);
  } catch (err) {
    if (err instanceof ShimRejectError) {
    }
  }
}
main().catch(() => {
  process.exit(0);
});
