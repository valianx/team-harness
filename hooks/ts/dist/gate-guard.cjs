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
var UNQUOTED_TAINT_CHARS = /* @__PURE__ */ new Set(["{", "}", "*", "?", "[", "~"]);
function appendChar(state, ch, taints) {
  state.value += ch;
  state.hasToken = true;
  if (taints) state.tainted = true;
}
function pushToken(state) {
  if (!state.hasToken) return;
  state.argv.push({ value: state.value, tainted: state.tainted });
  state.value = "";
  state.tainted = false;
  state.hasToken = false;
}
function pushSegment(state, nextOperator) {
  pushToken(state);
  if (state.argv.length > 0) {
    state.segments.push({ argv: state.argv, precedingOperator: state.pendingOp });
  }
  state.argv = [];
  state.pendingOp = nextOperator;
}
function stepSingleQuote(cmd, i, state) {
  const ch = cmd[i];
  if (ch === "'") {
    state.inSQ = false;
    return i + 1;
  }
  appendChar(state, ch, false);
  return i + 1;
}
function consumeParenSubstitution(cmd, startI, state) {
  appendChar(state, "$", true);
  appendChar(state, "(", true);
  let i = startI + 2;
  let depth = 1;
  let sq = false;
  let dq = false;
  while (i < cmd.length && depth > 0) {
    const ch = cmd[i];
    if (sq) {
      appendChar(state, ch, false);
      if (ch === "'") sq = false;
      i++;
      continue;
    }
    if (dq) {
      if (ch === "\\" && i + 1 < cmd.length) {
        appendChar(state, ch, false);
        appendChar(state, cmd[i + 1], false);
        i += 2;
        continue;
      }
      appendChar(state, ch, false);
      if (ch === '"') dq = false;
      i++;
      continue;
    }
    if (ch === "'") sq = true;
    else if (ch === '"') dq = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    appendChar(state, ch, false);
    i++;
  }
  return i;
}
function consumeBacktickSubstitution(cmd, startI, state) {
  appendChar(state, "`", true);
  let i = startI + 1;
  while (i < cmd.length && cmd[i] !== "`") {
    if (cmd[i] === "\\" && i + 1 < cmd.length) {
      appendChar(state, cmd[i], false);
      appendChar(state, cmd[i + 1], false);
      i += 2;
      continue;
    }
    appendChar(state, cmd[i], false);
    i++;
  }
  if (i < cmd.length) {
    appendChar(state, "`", false);
    i++;
  }
  return i;
}
function stepDoubleQuote(cmd, i, state) {
  const ch = cmd[i];
  if (ch === '"') {
    state.inDQ = false;
    return i + 1;
  }
  if (ch === "\\" && i + 1 < cmd.length) {
    const nc = cmd[i + 1];
    if (nc === '"' || nc === "\\" || nc === "$" || nc === "`") {
      appendChar(state, nc, false);
    } else {
      appendChar(state, "\\", false);
      appendChar(state, nc, false);
    }
    return i + 2;
  }
  if (ch === "$" && cmd[i + 1] === "(") return consumeParenSubstitution(cmd, i, state);
  if (ch === "`") return consumeBacktickSubstitution(cmd, i, state);
  if (ch === "$") {
    appendChar(state, ch, true);
    return i + 1;
  }
  appendChar(state, ch, false);
  return i + 1;
}
var TWO_CHAR_OPERATORS = [
  ["&&", "&&"],
  ["||", "||"]
];
var ONE_CHAR_OPERATORS = {
  ";": ";",
  "\n": "\n",
  "&": "&",
  "|": "|"
};
var PAREN_BOUNDARY_CHARS = /* @__PURE__ */ new Set(["(", ")"]);
function matchOperatorAt(cmd, i) {
  for (const [token, op] of TWO_CHAR_OPERATORS) {
    if (cmd.startsWith(token, i)) return { op, length: token.length };
  }
  const ch = cmd[i];
  if (ch in ONE_CHAR_OPERATORS) return { op: ONE_CHAR_OPERATORS[ch], length: 1 };
  if (PAREN_BOUNDARY_CHARS.has(ch)) return { op: "start", length: 1 };
  return null;
}
function stepUnquoted(cmd, i, state) {
  const ch = cmd[i];
  if (ch === " " || ch === "	" || ch === "\r") {
    pushToken(state);
    return i + 1;
  }
  const operator = matchOperatorAt(cmd, i);
  if (operator) {
    pushSegment(state, operator.op);
    return i + operator.length;
  }
  if (ch === "'") {
    state.inSQ = true;
    return i + 1;
  }
  if (ch === '"') {
    state.inDQ = true;
    return i + 1;
  }
  if (ch === "\\" && i + 1 < cmd.length) {
    appendChar(state, cmd[i + 1], false);
    return i + 2;
  }
  if (ch === "$" && cmd[i + 1] === "(") return consumeParenSubstitution(cmd, i, state);
  if (ch === "`") return consumeBacktickSubstitution(cmd, i, state);
  if (ch === "$") {
    appendChar(state, ch, true);
    return i + 1;
  }
  if (UNQUOTED_TAINT_CHARS.has(ch)) {
    appendChar(state, ch, true);
    return i + 1;
  }
  appendChar(state, ch, false);
  return i + 1;
}
function scanCommand(cmd) {
  const state = {
    segments: [],
    argv: [],
    value: "",
    tainted: false,
    hasToken: false,
    pendingOp: "start",
    inSQ: false,
    inDQ: false
  };
  let i = 0;
  while (i < cmd.length) {
    if (state.inSQ) i = stepSingleQuote(cmd, i, state);
    else if (state.inDQ) i = stepDoubleQuote(cmd, i, state);
    else i = stepUnquoted(cmd, i, state);
  }
  if (state.inSQ || state.inDQ) state.tainted = true;
  pushSegment(state, "start");
  return state.segments;
}
var DEFAULT_MAX_DEPTH = 5;
var SHELL_BASENAMES = /* @__PURE__ */ new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "ksh",
  "su",
  "ash",
  "hush",
  "mksh",
  "tcsh",
  "csh",
  "fish"
]);
var SHELL_C_FLAG_RE = /^-[A-Za-z]*c[A-Za-z]*$/;
var SAFE_NON_EXECUTING_BASENAMES = /* @__PURE__ */ new Set([
  "grep",
  "egrep",
  "fgrep",
  "echo",
  "printf",
  "cat",
  "ls",
  "ln",
  "test",
  "[",
  "tee",
  "head",
  "tail",
  "wc",
  "uniq",
  "cut",
  "tr",
  "nl",
  "rev",
  "tac",
  "paste",
  "join",
  "column",
  "fold",
  "fmt",
  "pr",
  "diff",
  "cmp",
  "comm",
  "md5sum",
  "sha1sum",
  "sha256sum",
  "sha512sum",
  "base64",
  "xxd",
  "od",
  "hexdump",
  "strings",
  "file",
  "pwd",
  "true",
  "false"
]);
var KNOWN_WRAPPER_BASENAMES = /* @__PURE__ */ new Set([...SHELL_BASENAMES, "eval", "xargs"]);
function lastPathSegment(value) {
  const idx = value.lastIndexOf("/");
  return idx >= 0 ? value.slice(idx + 1) : value;
}
function extractShellCPayload(argv) {
  for (let i = 1; i < argv.length; i++) {
    if (SHELL_C_FLAG_RE.test(argv[i].value)) {
      const payloadToken = argv[i + 1];
      if (!payloadToken) return { literal: null };
      return { literal: payloadToken.tainted ? null : payloadToken.value };
    }
  }
  return null;
}
function extractEvalPayload(argv) {
  const rest = argv.slice(1);
  if (rest.length === 0 || rest.some((t) => t.tainted)) return { literal: null };
  return { literal: rest.map((t) => t.value).join(" ") };
}
function extractXargsReplacementString(argv, shellIndex) {
  for (let i = 1; i < shellIndex; i++) {
    const tok = argv[i].value;
    if (tok === "-I") return argv[i + 1]?.value ?? "{}";
    if (tok === "-i" || tok === "--replace") return "{}";
    if (tok.startsWith("--replace=")) return tok.slice("--replace=".length);
    if (tok.startsWith("-I") && tok.length > 2) return tok.slice(2);
    if (tok.startsWith("-i") && tok.length > 2) return tok.slice(2);
  }
  return null;
}
function extractXargsPayload(argv) {
  for (let i = 1; i < argv.length; i++) {
    if (!SHELL_BASENAMES.has(lastPathSegment(argv[i].value))) continue;
    const shellPayload = extractShellCPayload(argv.slice(i)) ?? { literal: null };
    const replacement = extractXargsReplacementString(argv, i);
    if (replacement !== null && shellPayload.literal !== null && shellPayload.literal.includes(replacement)) {
      return { literal: null };
    }
    return shellPayload;
  }
  return null;
}
function extractEnvSplitStringPayload(argv) {
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.value === "-S" || tok.value === "--split-string") {
      const payloadToken = argv[i + 1];
      if (!payloadToken) return { literal: null };
      return { literal: payloadToken.tainted ? null : payloadToken.value };
    }
    if (tok.value.startsWith("--split-string=")) {
      return { literal: tok.tainted ? null : tok.value.slice("--split-string=".length) };
    }
  }
  return null;
}
function detectDispatcherShellCPayload(argv) {
  if (argv.length < 3) return null;
  if (!SHELL_BASENAMES.has(canonicalBasename(argv[1].value))) return null;
  return extractShellCPayload(argv.slice(1));
}
function detectSingleSegmentWrapperPayload(argv) {
  if (argv.length === 0) return null;
  const basename2 = canonicalBasename(argv[0].value);
  if (SHELL_BASENAMES.has(basename2)) return extractShellCPayload(argv);
  if (basename2 === "eval") return extractEvalPayload(argv);
  if (basename2 === "xargs") return extractXargsPayload(argv);
  if (basename2 === "env") return extractEnvSplitStringPayload(argv);
  if (!SAFE_NON_EXECUTING_BASENAMES.has(basename2)) {
    const dispatcherPayload = detectDispatcherShellCPayload(argv);
    if (dispatcherPayload !== null) return dispatcherPayload;
  }
  return null;
}
function detectPipeToShellPayload(first, second) {
  if (first.length === 0 || second.length === 0) return null;
  if (SAFE_NON_EXECUTING_BASENAMES.has(canonicalBasename(second[0].value))) return null;
  if (extractShellCPayload(second) !== null) return null;
  const firstBasename = lastPathSegment(first[0].value);
  if (firstBasename !== "echo" && firstBasename !== "printf") return { literal: null };
  const literalArgs = first.slice(1).filter((t) => !t.value.startsWith("-"));
  if (literalArgs.some((t) => t.tainted)) return { literal: null };
  return { literal: literalArgs.map((t) => t.value).join(" ") };
}
function toEffectiveCommand(argv) {
  return { argv, tainted: argv.some((t) => t.tainted) };
}
function mergeWrapperPayload(payload, depth, maxDepth) {
  if (payload.literal === null) return { commands: [], unresolvable: true, depthExceeded: false };
  if (depth >= maxDepth) return { commands: [], unresolvable: false, depthExceeded: true };
  const inner = analyzeCommandAtDepth(payload.literal, depth + 1, maxDepth);
  return {
    commands: inner.commands,
    unresolvable: inner.unresolvableShellPayload,
    depthExceeded: inner.depthExceeded
  };
}
function resolveSegments(rawSegments, depth, maxDepth) {
  const commands = [];
  let unresolvableShellPayload = false;
  let depthExceeded = false;
  const absorb = (result) => {
    commands.push(...result.commands);
    unresolvableShellPayload = unresolvableShellPayload || result.unresolvable;
    depthExceeded = depthExceeded || result.depthExceeded;
  };
  let i = 0;
  while (i < rawSegments.length) {
    const seg = rawSegments[i];
    commands.push(toEffectiveCommand(seg.argv));
    const next = rawSegments[i + 1];
    if (next && next.precedingOperator === "|") {
      const pipePayload = detectPipeToShellPayload(seg.argv, next.argv);
      if (pipePayload !== null) {
        commands.push(toEffectiveCommand(next.argv));
        absorb(mergeWrapperPayload(pipePayload, depth, maxDepth));
        i += 2;
        continue;
      }
    }
    const payload = detectSingleSegmentWrapperPayload(seg.argv);
    if (payload !== null) absorb(mergeWrapperPayload(payload, depth, maxDepth));
    i++;
  }
  return { commands, unresolvableShellPayload, depthExceeded };
}
function analyzeCommandAtDepth(cmd, depth, maxDepth) {
  return resolveSegments(scanCommand(cmd), depth, maxDepth);
}
function analyzeCommand(cmd, maxDepth = DEFAULT_MAX_DEPTH) {
  return analyzeCommandAtDepth(cmd, 0, maxDepth);
}
var ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
function isEnvAssignmentToken(token) {
  return ENV_ASSIGNMENT_RE.test(token.value);
}
var GIT_BOOLEAN_GLOBAL_OPTIONS = /* @__PURE__ */ new Set(["-p", "--paginate", "--no-pager"]);
var GIT_TREE_REDIRECT_OPTIONS = /* @__PURE__ */ new Set(["--git-dir", "--work-tree", "--namespace", "--exec-path"]);
function resolveCDirToken(argv, index, alreadySeen) {
  const dirTok = argv[index + 1];
  if (!alreadySeen && dirTok && !dirTok.tainted && !dirTok.value.startsWith("-")) {
    return { cDir: dirTok.value, failClosed: false };
  }
  return { cDir: null, failClosed: true };
}
function stepGitGlobalOption(argv, i, cDirSeen) {
  const tok = argv[i];
  if (tok.tainted) return { advance: 1, failClosed: true, cDir: null };
  if (GIT_BOOLEAN_GLOBAL_OPTIONS.has(tok.value)) return { advance: 1, failClosed: false, cDir: null };
  if (tok.value === "-C") {
    const resolved = resolveCDirToken(argv, i, cDirSeen);
    return { advance: 2, failClosed: resolved.failClosed, cDir: resolved.cDir };
  }
  if (tok.value === "-c") return { advance: 2, failClosed: true, cDir: null };
  const eqIdx = tok.value.indexOf("=");
  const optName = eqIdx >= 0 ? tok.value.slice(0, eqIdx) : tok.value;
  const advance = GIT_TREE_REDIRECT_OPTIONS.has(optName) && eqIdx < 0 ? 2 : 1;
  return { advance, failClosed: true, cDir: null };
}
function scanGitGlobalOptions(argv, start) {
  let i = start;
  let requiresFailClosed = false;
  let cDir = null;
  let cDirSeen = false;
  while (i < argv.length && argv[i].value.startsWith("-")) {
    const step = stepGitGlobalOption(argv, i, cDirSeen);
    if (step.cDir !== null) {
      cDir = step.cDir;
      cDirSeen = true;
    }
    requiresFailClosed = requiresFailClosed || step.failClosed;
    i += step.advance;
  }
  return { subcommandIndex: i < argv.length ? i : -1, requiresFailClosed, cDir: requiresFailClosed ? null : cDir };
}
var GIT_DISPATCHER_PREFIX = "git-";
function stripExeSuffix(basename2) {
  return /\.exe$/i.test(basename2) ? basename2.slice(0, -4) : basename2;
}
function canonicalBasename(rawValue) {
  return stripExeSuffix(lastPathSegment(rawValue)).toLowerCase();
}
function basenameNoExe(rawValue) {
  return stripExeSuffix(lastPathSegment(rawValue));
}
function extractGitDispatcherSubcommand(canonical, rawNoExe) {
  if (!canonical.startsWith(GIT_DISPATCHER_PREFIX)) return null;
  const sub = rawNoExe.slice(GIT_DISPATCHER_PREFIX.length);
  return sub.length > 0 ? sub : null;
}
function classifyGitDispatcher(argv, afterBinary, prefixFailClosed) {
  const scan = scanGitGlobalOptions(argv, afterBinary);
  const requiresFailClosed = prefixFailClosed || scan.requiresFailClosed;
  if (scan.subcommandIndex < 0) {
    return { binary: "git", gitSubcommand: null, args: [], requiresFailClosed, cDir: requiresFailClosed ? null : scan.cDir };
  }
  const subTok = argv[scan.subcommandIndex];
  return {
    binary: "git",
    gitSubcommand: subTok.value,
    args: argv.slice(scan.subcommandIndex + 1),
    requiresFailClosed: requiresFailClosed || subTok.tainted,
    cDir: requiresFailClosed ? null : scan.cDir
  };
}
var RUNNER_MODELS = {
  env: { valueFlags: /* @__PURE__ */ new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]), extraPositionals: 0 },
  timeout: { valueFlags: /* @__PURE__ */ new Set(["-k", "--kill-after", "-s", "--signal"]), extraPositionals: 1 },
  nice: { valueFlags: /* @__PURE__ */ new Set(["-n", "--adjustment"]), extraPositionals: 0 },
  nohup: { valueFlags: /* @__PURE__ */ new Set(), extraPositionals: 0 },
  command: { valueFlags: /* @__PURE__ */ new Set(), extraPositionals: 0 },
  stdbuf: { valueFlags: /* @__PURE__ */ new Set(["-i", "--input", "-o", "--output", "-e", "--error"]), extraPositionals: 0 },
  setsid: { valueFlags: /* @__PURE__ */ new Set(), extraPositionals: 0 },
  time: { valueFlags: /* @__PURE__ */ new Set(["-o", "--output"]), extraPositionals: 0 },
  sudo: {
    valueFlags: /* @__PURE__ */ new Set([
      "-u",
      "--user",
      "-g",
      "--group",
      "-h",
      "--host",
      "-p",
      "--prompt",
      "-r",
      "--role",
      "-t",
      "--type",
      "-C",
      "--close-from"
    ]),
    extraPositionals: 0
  },
  doas: { valueFlags: /* @__PURE__ */ new Set(["-C", "-u"]), extraPositionals: 0 }
};
function skipRunnerPrefix(argv, start, model) {
  let idx = start;
  while (idx < argv.length && argv[idx].value.startsWith("-") && argv[idx].value !== "--") {
    const tok = argv[idx].value;
    const eqIdx = tok.indexOf("=");
    const name = eqIdx >= 0 ? tok.slice(0, eqIdx) : tok;
    idx += model.valueFlags.has(name) && eqIdx < 0 ? 2 : 1;
  }
  if (idx < argv.length && argv[idx].value === "--") idx++;
  idx += model.extraPositionals;
  while (idx < argv.length && isEnvAssignmentToken(argv[idx])) idx++;
  return idx;
}
function buildClassifiedResult(resolved) {
  const { argv, afterBinary, canonical, rawNoExe, requiresFailClosed, noExeSuffixPresent } = resolved;
  if (canonical === "git") {
    const classified = classifyGitDispatcher(argv, afterBinary, requiresFailClosed);
    return { ...classified, binaryCaseExact: noExeSuffixPresent && rawNoExe === "git" };
  }
  const dispatcherSub = extractGitDispatcherSubcommand(canonical, rawNoExe);
  if (dispatcherSub !== null) {
    return {
      binary: "git",
      gitSubcommand: dispatcherSub,
      args: argv.slice(afterBinary),
      requiresFailClosed,
      cDir: null,
      binaryCaseExact: noExeSuffixPresent && rawNoExe.startsWith(GIT_DISPATCHER_PREFIX)
    };
  }
  return {
    binary: canonical,
    gitSubcommand: null,
    args: argv.slice(afterBinary),
    requiresFailClosed,
    cDir: null,
    binaryCaseExact: noExeSuffixPresent && rawNoExe === canonical
  };
}
function scanForGitGhSignal(argv, start) {
  for (let j = start; j < argv.length; j++) {
    const raw = argv[j].value;
    const canon = canonicalBasename(raw);
    if (canon === "git") return { index: j, binary: "git", dispatcherSub: null };
    if (canon === "gh") return { index: j, binary: "gh", dispatcherSub: null };
    const dispatcherSub = extractGitDispatcherSubcommand(canon, basenameNoExe(raw));
    if (dispatcherSub !== null) return { index: j, binary: "git", dispatcherSub };
  }
  return null;
}
function buildAmbiguousWrapperResult(argv, match) {
  if (match.dispatcherSub !== null) {
    return {
      binary: "git",
      gitSubcommand: match.dispatcherSub,
      args: argv.slice(match.index + 1),
      requiresFailClosed: true,
      cDir: null,
      binaryCaseExact: false
    };
  }
  if (match.binary === "git") {
    const classified = classifyGitDispatcher(argv, match.index + 1, true);
    return { ...classified, binaryCaseExact: false };
  }
  return {
    binary: "gh",
    gitSubcommand: null,
    args: argv.slice(match.index + 1),
    requiresFailClosed: true,
    cDir: null,
    binaryCaseExact: false
  };
}
function classifyCoveredAction(cmd) {
  const argv = cmd.argv;
  let i = 0;
  let requiresFailClosed = false;
  for (; ; ) {
    if (i >= argv.length) return null;
    if (isEnvAssignmentToken(argv[i])) {
      requiresFailClosed = true;
      i++;
      continue;
    }
    const model = RUNNER_MODELS[canonicalBasename(argv[i].value)];
    if (!model) break;
    requiresFailClosed = true;
    i = skipRunnerPrefix(argv, i + 1, model);
  }
  if (i >= argv.length) return null;
  const binaryTok = argv[i];
  const rawWithExe = lastPathSegment(binaryTok.value);
  const rawNoExe = stripExeSuffix(rawWithExe);
  const canonical = rawNoExe.toLowerCase();
  const isDirectGitForm = canonical === "git" || extractGitDispatcherSubcommand(canonical, rawNoExe) !== null;
  if (!isDirectGitForm && !SAFE_NON_EXECUTING_BASENAMES.has(canonical) && !KNOWN_WRAPPER_BASENAMES.has(canonical)) {
    const match = scanForGitGhSignal(argv, i + 1);
    if (match !== null) return buildAmbiguousWrapperResult(argv, match);
  }
  if (binaryTok.tainted) requiresFailClosed = true;
  return buildClassifiedResult({
    argv,
    afterBinary: i + 1,
    canonical,
    rawNoExe,
    requiresFailClosed,
    noExeSuffixPresent: rawWithExe === rawNoExe
  });
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
var TAG_LIKE_RE = /^[vV]?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$/;
function extractRawDestination(refspec) {
  const colonIdx = refspec.lastIndexOf(":");
  if (colonIdx < 0) return refspec;
  const src = refspec.slice(0, colonIdx);
  if (src === "") return null;
  const afterColon = refspec.slice(colonIdx + 1);
  return afterColon === "" ? src : afterColon;
}
function resolveSymbolicDestination(rawDst, reader) {
  if (rawDst === "HEAD" || rawDst === "@") return reader.gitCurrentBranch();
  if (rawDst.startsWith("@")) return null;
  return rawDst;
}
function matchBenignPushGrammar(argv, tainted, reader) {
  const notMatched = { matched: false, destination: null };
  if (tainted.some(Boolean)) return notMatched;
  const flagTokens = argv.filter((t) => t.startsWith("-"));
  const positionals = argv.filter((t) => !t.startsWith("-"));
  if (!flagTokens.every(isBenignPushFlag)) return notMatched;
  if (positionals.length !== 2) return notMatched;
  if (positionals[0] !== "origin") return notMatched;
  const refspec = positionals[1];
  if (refspec.startsWith("+")) return notMatched;
  const rawDst = extractRawDestination(refspec);
  if (rawDst === null) return notMatched;
  if (TAG_LIKE_RE.test(rawDst)) return notMatched;
  const dst = resolveSymbolicDestination(rawDst, reader);
  if (dst === null || !isPlainBranchDestination(dst)) return notMatched;
  return { matched: true, destination: dst };
}

// bodies/gate-guard.ts
function deny(reason) {
  return { decision: "deny", reason, mutations: null };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
function isGhPrCreateArgs(args) {
  return args[0]?.value.toLowerCase() === "pr" && args[1]?.value.toLowerCase() === "create";
}
function findCoveredMatch(analyzed) {
  for (const effective of analyzed.commands) {
    const classified = classifyCoveredAction(effective);
    if (classified === null) continue;
    if (classified.binary === "git" && classified.gitSubcommand?.toLowerCase() === "push") {
      return { kind: "push", args: classified.args };
    }
    if (classified.binary === "gh" && isGhPrCreateArgs(classified.args)) {
      return { kind: "pr-create" };
    }
  }
  return null;
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
  if (workingBranch !== null && workingBranch !== "null" && currentBranch !== null) {
    return workingBranch === currentBranch;
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
  const covered = findCoveredMatch(analyzeCommand(rawCmd));
  if (covered === null) return none();
  const lane = resolveGoverningLane(reader);
  if (lane === null) return none();
  if (covered.kind === "push") {
    const argv = covered.args.map((tok) => tok.value);
    const tainted = covered.args.map((tok) => tok.tainted);
    if (!matchBenignPushGrammar(argv, tainted, reader).matched) {
      return deny(
        "gate-guard: force-push denied \u2014 unconditional on gate3_release for a detected pipeline lane (Invariant E/G). Only the exact benign form (git push [-u|--set-upstream|-v|--verbose|--progress] origin <plain-branch>) is authorized in-lane, resolved from the executed argv \u2014 a wrapper-embedded or per-subcommand-binary invocation is inspected the same as a bare command; any deviation \u2014 a force flag, a '+'-prefixed refspec, a tainted/unresolved token, or a tag-like/ref-namespace-qualified destination \u2014 is denied, even after 'ship'. See agents/_shared/gate-contract.md \xA7 Outward-action release floor."
      );
    }
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
