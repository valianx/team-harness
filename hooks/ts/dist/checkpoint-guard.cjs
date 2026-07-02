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

// entry/checkpoint-guard.cc.ts
var fs = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);
var os = __toESM(require("node:os"), 1);

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

// bodies/checkpoint-guard.ts
function allow() {
  return { decision: "allow", reason: "", mutations: null };
}
function deny(reason) {
  return { decision: "deny", reason, mutations: null };
}
function readField(content, field) {
  const lines = content.split("\n");
  const prefix = new RegExp(`^\\s*-\\s*${field}:\\s*(.+?)\\s*$`);
  for (const line of lines) {
    const m = prefix.exec(line);
    if (m) return m[1];
  }
  return null;
}
function fieldIs(content, field, value) {
  const lines = content.split("\n");
  const pattern = new RegExp(`^\\s*-\\s*${field}:\\s*${value}\\s*$`);
  return lines.some((line) => pattern.test(line));
}
function isTerminalStatus(content) {
  const status = readField(content, "status");
  if (status === null) return false;
  return status === "complete" || status.startsWith("blocked-");
}
function evaluate(input, reader) {
  void input;
  const subagentType = typeof input.tool?.input?.["subagent_type"] === "string" ? input.tool.input["subagent_type"] : "";
  const searchRoot = reader.cwd();
  const rawCandidates = reader.findFiles(searchRoot, "00-state.md", 4);
  const config = reader.readConfig();
  if (config !== null) {
    const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
    const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
    const logsSub = typeof config["logs-subfolder"] === "string" ? config["logs-subfolder"] : "work-logs";
    if (logsMode === "obsidian" && logsPath) {
      const repoName = searchRoot.split(/[/\\]/).filter(Boolean).pop() ?? "";
      if (repoName) {
        const vaultRoot = `${logsPath}/${logsSub}/${repoName}`;
        const vaultCandidates = reader.findFiles(vaultRoot, "00-state.md", 3);
        rawCandidates.push(...vaultCandidates);
      }
    }
  }
  if (rawCandidates.length === 0) {
    return allow();
  }
  const sorted = rawCandidates.slice().sort((a, b) => reader.mtime(b) - reader.mtime(a));
  let stateContent = null;
  for (const candidate of sorted) {
    const content = reader.readFile(candidate);
    if (content === null) continue;
    if (isTerminalStatus(content)) continue;
    stateContent = content;
    break;
  }
  if (stateContent === null) {
    return allow();
  }
  if (fieldIs(stateContent, "fast_mode", "true")) return allow();
  if (fieldIs(stateContent, "discover_state", "bypassed")) return allow();
  const bugTierLines = stateContent.split("\n");
  for (const line of bugTierLines) {
    if (/^\s*-\s*bug_tier:\s*[0-4]\s*$/.test(line)) return allow();
  }
  if (fieldIs(stateContent, "checkpoint_boundary", "null")) return allow();
  const hasBoundaryField = stateContent.split("\n").some((line) => /^\s*-\s*checkpoint_boundary:/.test(line));
  if (!hasBoundaryField) return allow();
  const boundaryValue = readField(stateContent, "checkpoint_boundary") ?? "";
  if (boundaryValue === "intake-plan") {
    if (subagentType !== "th:architect") {
      return allow();
    }
  }
  const knownBoundaries = /* @__PURE__ */ new Set(["intake-plan", "research-next", "postverify-next"]);
  if (!knownBoundaries.has(boundaryValue)) {
    return allow();
  }
  const advanceFresh = fieldIs(stateContent, "checkpoint_advance_fresh", "true");
  const clarityConfirmed = fieldIs(stateContent, "functional_clarity_confirmed", "true");
  if (advanceFresh && clarityConfirmed) {
    return allow();
  }
  if (boundaryValue === "intake-plan") {
    if (!advanceFresh && !clarityConfirmed) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B1 (intake\u2192plan): fresh advance signal missing and functional clarity artifact not confirmed. Respond to the planning-confirmation prompt and confirm the functional statement before the architect is dispatched."
      );
    } else if (!advanceFresh) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B1 (intake\u2192plan): fresh advance signal missing. Respond explicitly to the planning-confirmation prompt (\xBFPasamos a planeaci\xF3n? [plan/explorar]) before the architect is dispatched."
      );
    } else {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B1 (intake\u2192plan): functional clarity artifact not confirmed. Confirm a short functional statement (what we are building, functionally) before the architect is dispatched."
      );
    }
  }
  if (boundaryValue === "research-next") {
    if (!advanceFresh && !clarityConfirmed) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B2 (research\u2192next): fresh advance signal missing and functional clarity artifact not confirmed. Confirm what to do with the research findings and provide a fresh advance signal before the next phase is dispatched."
      );
    } else if (!advanceFresh) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B2 (research\u2192next): fresh advance signal missing. Respond explicitly to the checkpoint prompt before the next phase is dispatched."
      );
    } else {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B2 (research\u2192next): functional clarity artifact not confirmed. Confirm the direction for the next step based on the research findings."
      );
    }
  }
  if (boundaryValue === "postverify-next") {
    if (!advanceFresh && !clarityConfirmed) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B3 (postverify\u2192next): fresh advance signal missing and functional clarity artifact not confirmed. Confirm direction for the next step after verification and provide a fresh advance signal."
      );
    } else if (!advanceFresh) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B3 (postverify\u2192next): fresh advance signal missing. Respond explicitly to the checkpoint prompt before the next phase is dispatched."
      );
    } else {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B3 (postverify\u2192next): functional clarity artifact not confirmed. Confirm the direction for the next step after verification."
      );
    }
  }
  return allow();
}

// entry/checkpoint-guard.cc.ts
function makeStateReader() {
  return {
    readFile(filePath) {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },
    findFiles(dir, name, maxDepth) {
      try {
        const results = [];
        const stack = [{ dir, depth: 0 }];
        while (stack.length > 0) {
          const { dir: current, depth } = stack.pop();
          let entries;
          try {
            entries = fs.readdirSync(current, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const e of entries) {
            const fullPath = path.join(current, e.name);
            if (e.isDirectory()) {
              if (depth < maxDepth) {
                stack.push({ dir: fullPath, depth: depth + 1 });
              }
            } else if (e.name === name) {
              results.push(fullPath);
            }
          }
        }
        return results;
      } catch {
        return [];
      }
    },
    // fix(checkpoint-guard): return 0 on error per StateReader contract (null → NaN in sort)
    mtime(filePath) {
      try {
        return fs.statSync(filePath).mtimeMs;
      } catch {
        return 0;
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
  const reader = makeStateReader();
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
