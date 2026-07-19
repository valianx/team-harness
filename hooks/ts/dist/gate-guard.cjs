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

// entry/gate-guard.cc.ts
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

// bodies/command-lexer.ts
var FILLER_CHAR = "x";
var SHELL_DASH_C_RE = /\b(?:bash|sh|zsh|dash|ksh|su)\s+-[a-zA-Z]*c[a-zA-Z]*(?:\s|$)/i;
var EVAL_RE = /(^|[\s;&|<>()`])eval(\s|$)/i;
var XARGS_RE = /(^|[\s;&|<>()`])xargs(\s|$)/i;
var COMMAND_SUBSTITUTION_RE = /\$\(|`/;
var PROCESS_SUBSTITUTION_RE = /[<>]\(/;
var PIPE_TO_SHELL_RE = /\|\s*(?:\S*\/)?(?:bash|sh|zsh|dash|ksh)(?:\s|$)/i;
var SSH_RE = /(^|[\s;&|<>()`])ssh(\s|$)/i;
function hasCommandExecutingWrapper(cmd) {
  return SHELL_DASH_C_RE.test(cmd) || EVAL_RE.test(cmd) || XARGS_RE.test(cmd) || COMMAND_SUBSTITUTION_RE.test(cmd) || PROCESS_SUBSTITUTION_RE.test(cmd) || PIPE_TO_SHELL_RE.test(cmd) || SSH_RE.test(cmd);
}
function stepInsideSingleQuote(cmd, i, state, spans) {
  if (cmd[i] === "'") {
    spans.push({ start: state.spanStart, end: i });
    state.inSingle = false;
  }
  return i + 1;
}
function stepInsideDoubleQuote(cmd, i, state, spans) {
  const ch = cmd[i];
  if (ch === "\\" && i + 1 < cmd.length) return i + 2;
  if (ch === '"') {
    spans.push({ start: state.spanStart, end: i });
    state.inDouble = false;
    return i + 1;
  }
  return i + 1;
}
function stepOutsideQuote(cmd, i, state) {
  const ch = cmd[i];
  if (ch === "\\" && i + 1 < cmd.length) return i + 2;
  if (ch === "'") {
    state.inSingle = true;
    state.spanStart = i + 1;
    return i + 1;
  }
  if (ch === '"') {
    state.inDouble = true;
    state.spanStart = i + 1;
    return i + 1;
  }
  return i + 1;
}
function analyzeQuotes(cmd) {
  const spans = [];
  const state = { inSingle: false, inDouble: false, spanStart: -1 };
  let i = 0;
  while (i < cmd.length) {
    if (state.inSingle) {
      i = stepInsideSingleQuote(cmd, i, state, spans);
    } else if (state.inDouble) {
      i = stepInsideDoubleQuote(cmd, i, state, spans);
    } else {
      i = stepOutsideQuote(cmd, i, state);
    }
  }
  return { balanced: !state.inSingle && !state.inDouble, spans };
}
function blankSpans(cmd, spans) {
  const chars = cmd.split("");
  for (const { start, end } of spans) {
    for (let idx = start; idx < end; idx++) {
      chars[idx] = FILLER_CHAR;
    }
  }
  return chars.join("");
}
function prepareRoutableCommand(cmd) {
  if (hasCommandExecutingWrapper(cmd)) {
    return { routable: cmd, blanked: false };
  }
  const { balanced, spans } = analyzeQuotes(cmd);
  if (!balanced || spans.length === 0) {
    return { routable: cmd, blanked: false };
  }
  return { routable: blankSpans(cmd, spans), blanked: true };
}
var SAFE_COMMAND_CHAR_RE = /^[A-Za-z0-9 _./-]*$/;
function isLiteralSafeCommand(cmd) {
  return SAFE_COMMAND_CHAR_RE.test(cmd);
}
var BENIGN_PUSH_FLAG_RE = /^(-u|--set-upstream|-v|--verbose|--progress)$/;
function isBenignPushFlag(token) {
  return BENIGN_PUSH_FLAG_RE.test(token);
}
var PLAIN_BRANCH_NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
function isPlainBranchName(token) {
  return PLAIN_BRANCH_NAME_RE.test(token);
}
var REF_NAMESPACE_WORDS = /* @__PURE__ */ new Set(["refs", "heads", "tags", "remotes"]);
function isPlainBranchDestination(dst) {
  if (!isPlainBranchName(dst)) return false;
  const firstSegment = dst.split("/")[0].toLowerCase();
  return !REF_NAMESPACE_WORDS.has(firstSegment);
}
function matchBenignPushGrammar(rawCmd) {
  if (!isLiteralSafeCommand(rawCmd)) return { matched: false };
  const tokens = rawCmd.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "git" || tokens[1] !== "push") return { matched: false };
  const rest = tokens.slice(2);
  const flagTokens = rest.filter((t) => t.startsWith("-"));
  const positionals = rest.filter((t) => !t.startsWith("-"));
  if (!flagTokens.every(isBenignPushFlag)) return { matched: false };
  if (positionals.length !== 2) return { matched: false };
  if (positionals[0] !== "origin") return { matched: false };
  if (!isPlainBranchDestination(positionals[1])) return { matched: false };
  return { matched: true };
}

// bodies/gate-guard.ts
function deny(reason) {
  return { decision: "deny", reason, mutations: null };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
var GIT_PUSH_RE = /(^|[\s|;&<>()`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$|[;&|<>()`"'$])/i;
var GH_PR_CREATE_RE = /(^|[\s|;&<>()`])gh\s+pr\s+create(\s|$|[;&|<>()`"'$])/i;
function readField(content, field) {
  const lines = content.split("\n");
  const prefix = new RegExp(`^\\s*-\\s*${field}:\\s*(.+?)\\s*$`);
  for (const line of lines) {
    const m = prefix.exec(line);
    if (m) return m[1];
  }
  return null;
}
function isTerminalStatus(content) {
  const status = readField(content, "status");
  if (status === null) return false;
  return status === "complete" || status.startsWith("blocked-");
}
function resolveRepoName(reader) {
  const gitName = reader.gitRepoName();
  if (gitName) return gitName;
  return reader.cwd().split(/[/\\]/).filter(Boolean).pop() ?? "";
}
function gatherCandidatePaths(reader) {
  const searchRoot = reader.cwd();
  const candidates = reader.findFiles(searchRoot, "00-state.md", 4);
  const config = reader.readConfig();
  if (config !== null) {
    const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
    const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
    const logsSub = typeof config["logs-subfolder"] === "string" ? config["logs-subfolder"] : "work-logs";
    if (logsMode === "obsidian" && logsPath) {
      const repoName = resolveRepoName(reader);
      if (repoName) {
        const vaultRoot = `${logsPath}/${logsSub}/${repoName}`;
        candidates.push(...reader.findFiles(vaultRoot, "00-state.md", 3));
      }
    }
  }
  return candidates;
}
function laneCorrelates(content, currentBranch, cwdReal, reader) {
  const workingBranch = readField(content, "working_branch");
  if (workingBranch !== null && currentBranch !== null && workingBranch === currentBranch) {
    return true;
  }
  const worktreeField = readField(content, "worktree");
  if (worktreeField !== null && worktreeField !== "null" && cwdReal !== null) {
    const worktreeReal = reader.realpath(worktreeField);
    if (worktreeReal !== null && worktreeReal === cwdReal) return true;
  }
  return false;
}
function resolveGoverningLane(reader) {
  const paths = gatherCandidatePaths(reader);
  if (paths.length === 0) return null;
  const sorted = paths.slice().sort((a, b) => reader.mtime(b) - reader.mtime(a));
  const currentBranch = reader.gitCurrentBranch();
  const cwdReal = reader.realpath(reader.cwd());
  for (const candidatePath of sorted) {
    const content = reader.readFile(candidatePath);
    if (content === null) continue;
    if (isTerminalStatus(content)) continue;
    if (laneCorrelates(content, currentBranch, cwdReal, reader)) return content;
  }
  return null;
}
function evaluate(input, reader) {
  const rawCmd = typeof input.tool?.input?.["command"] === "string" ? input.tool.input["command"] : "";
  if (!rawCmd) return none();
  const routable = prepareRoutableCommand(rawCmd).routable;
  const isGitPush = GIT_PUSH_RE.test(routable);
  const isGhPrCreate = GH_PR_CREATE_RE.test(routable);
  if (!isGitPush && !isGhPrCreate) return none();
  const lane = resolveGoverningLane(reader);
  if (lane === null) return none();
  if (isGitPush && !matchBenignPushGrammar(rawCmd).matched) {
    return deny(
      "gate-guard: force-push denied \u2014 unconditional on gate3_release for a detected pipeline lane (Invariant E/G). Only the exact benign form (git push [-u|--set-upstream|-v|--verbose|--progress] origin <plain-branch>) is authorized in-lane; any deviation \u2014 a force flag, a '+'-prefixed refspec, or any character outside the safe set [A-Za-z0-9 _./-] \u2014 is denied, even after 'ship'. See agents/_shared/gate-contract.md \xA7 Outward-action release floor."
    );
  }
  const gate3Release = readField(lane, "gate3_release");
  if (gate3Release === "ship") return none();
  return deny(
    "gate-guard: outward action blocked \u2014 the resolved pipeline lane has not registered gate3_release: ship at STAGE-GATE-3. Complete STAGE-GATE-3 before pushing or opening the PR. See agents/_shared/gate-contract.md \xA7 Outward-action release floor."
  );
}

// bodies/prepublish-guard.ts
var CONTROL_CHAR_RE = /[\x00-\x09\x0b-\x1f\x7f]/;

// entry/gate-guard.cc.ts
var GIT_EXEC_TIMEOUT_MS = 5e3;
function makeReader() {
  return {
    readFile(filePath) {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },
    findFiles(rootDir, name, maxDepth) {
      try {
        const results = [];
        const stack = [{ dir: rootDir, depth: 0 }];
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
              if (depth < maxDepth) stack.push({ dir: fullPath, depth: depth + 1 });
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
    },
    realpath(filePath) {
      try {
        return fs.realpathSync(filePath);
      } catch {
        return null;
      }
    },
    // Worktree-stable repo name: derives from the MAIN repo's `.git`
    // directory (git-common-dir), not cwd()'s own last path segment — a
    // `th-wt-{slug}` worktree checkout has a basename that does NOT match
    // the repo name (docs/worktree-discipline.md).
    gitRepoName() {
      try {
        const out = (0, import_node_child_process.execFileSync)("git", ["rev-parse", "--git-common-dir"], {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          stdio: ["ignore", "pipe", "ignore"]
        }).trim();
        if (!out) return null;
        const absCommonDir = path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
        const repoRoot = path.dirname(absCommonDir);
        const name = path.basename(repoRoot);
        return name || null;
      } catch {
        return null;
      }
    },
    gitCurrentBranch() {
      try {
        return (0, import_node_child_process.execFileSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          stdio: ["ignore", "pipe", "ignore"]
        }).trim();
      } catch {
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
function extractCwdFromRaw(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const cwd = parsed["cwd"];
      if (typeof cwd === "string") return cwd;
    }
  } catch {
  }
  return "";
}
function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
function resolveWorktreeCwd(raw) {
  const cwd = extractCwdFromRaw(raw);
  if (!cwd) return;
  if (CONTROL_CHAR_RE.test(cwd)) {
    process.stderr.write(
      "gate-guard: payload cwd contains control characters; skipping cd (SEC-DR-A, fail-open)\n"
    );
    return;
  }
  if (!isDirectory(cwd)) {
    process.stderr.write("gate-guard: payload cwd does not exist as a directory; skipping cd (fail-open)\n");
    return;
  }
  try {
    process.chdir(cwd);
  } catch {
    process.stderr.write("gate-guard: cd into payload cwd failed; continuing with process CWD (fail-open)\n");
  }
}
async function main() {
  const raw = await readStdin();
  resolveWorktreeCwd(raw);
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
