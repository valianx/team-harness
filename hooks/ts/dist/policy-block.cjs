"use strict";

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
  const basename = canonicalBasename(argv[0].value);
  if (SHELL_BASENAMES.has(basename)) return extractShellCPayload(argv);
  if (basename === "eval") return extractEvalPayload(argv);
  if (basename === "xargs") return extractXargsPayload(argv);
  if (basename === "env") return extractEnvSplitStringPayload(argv);
  if (!SAFE_NON_EXECUTING_BASENAMES.has(basename)) {
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
function stripExeSuffix(basename) {
  return /\.exe$/i.test(basename) ? basename.slice(0, -4) : basename;
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

// bodies/policy-block.ts
function deny(reason) {
  return {
    decision: "deny",
    reason: `Blocked by team-harness policy: ${reason}. If you genuinely need this, run it manually outside Claude or scope an exception in hooks/ts/bodies/policy-block.ts.`,
    mutations: null
  };
}
function ask(reason) {
  return {
    decision: "ask",
    reason: `team-harness policy: possible secret detected (${reason}). Confirm this value is safe to commit, or cancel and remove it.`,
    mutations: null
  };
}
function askReason(reason) {
  return {
    decision: "ask",
    reason: `team-harness policy: ${reason}`,
    mutations: null
  };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
function escapeRegExpLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeLexicalNoise(cmd) {
  let out = "";
  let inSingleQuote = false;
  let i = 0;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false;
      } else {
        out += ch;
      }
      i++;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < cmd.length) {
      out += cmd[i + 1];
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
function buildClaudeSkipPermissionsRouterRegex() {
  const pathQualifierPrefix = String.raw`(?:[^\s|;&<>()\x60$]*/)?`;
  const flagLiteral = escapeRegExpLiteral("--dangerously-skip-permissions");
  return new RegExp(
    String.raw`(^|[\s|;&<>()\x60])${pathQualifierPrefix}claude\b[\s\S]*?${flagLiteral}\b`,
    "i"
  );
}
var CLAUDE_SKIP_PERMISSIONS_RE = buildClaudeSkipPermissionsRouterRegex();
function groupRepeatedPlaceholder(escapedText, token, firstGroup, laterGroup) {
  const parts = escapedText.split(token);
  if (parts.length === 1) return escapedText;
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result += (i === 1 ? firstGroup : laterGroup) + parts[i];
  }
  return result;
}
var LEGACY_TMUX_SPAWN_RAW = 'claude --worktree {task-name} --tmux --dangerously-skip-permissions \\\n  --settings \'{\n    "hooks": {\n      "Stop": [{"hooks": [{"type": "command", "command": "STATE=$(cat workspaces/*/00-state.md 2>/dev/null); STATUS=$(echo \\"$STATE\\" | grep -oP \\"status: \\\\K\\\\w+\\" | head -1); SUMMARY=$(echo \\"$STATE\\" | grep -A1 \\"^## Agent Results\\" | tail -1 | head -c 200); printf \\"%s|%s|%s\\\\n\\" \\"{task-name}\\" \\"${STATUS:-unknown}\\" \\"${SUMMARY:-no summary}\\" > /tmp/batch-results/{task-name}.done; echo $(date +%s) {task-name} DONE >> /tmp/batch-results/events.log"}]}],\n      "PostToolUse": [{"hooks": [{"type": "command", "command": "if echo \\"$TOOL_INPUT\\" | grep -q 00-state.md; then PHASE=$(grep -oP \\"phase: \\\\K[\\\\w.]+\\" workspaces/*/00-state.md 2>/dev/null | head -1); printf \\"%s|%s\\\\n\\" \\"{task-name}\\" \\"${PHASE:-unknown}\\" > /tmp/batch-results/{task-name}.progress; echo $(date +%s) {task-name} PROGRESS >> /tmp/batch-results/events.log; fi"}]}]\n    }\n  }\' \\\n  -p "/th:issue #{number} --skip-delivery"';
function buildLegacyTmuxSpawnExemptionRegex() {
  const escaped = escapeRegExpLiteral(LEGACY_TMUX_SPAWN_RAW);
  const withTaskName = groupRepeatedPlaceholder(
    escaped,
    escapeRegExpLiteral("{task-name}"),
    "([A-Za-z0-9._-]{1,80})",
    "\\1"
  );
  const withNumber = groupRepeatedPlaceholder(
    withTaskName,
    escapeRegExpLiteral("{number}"),
    "([0-9]{1,10})",
    "\\2"
  );
  return new RegExp(`^${withNumber}$`);
}
var LEGACY_TMUX_SPAWN_EXEMPTION_RE = buildLegacyTmuxSpawnExemptionRegex();
function evaluateClaudeSkipPermissionsSpawn(cmd) {
  if (!CLAUDE_SKIP_PERMISSIONS_RE.test(normalizeLexicalNoise(cmd))) return null;
  if (LEGACY_TMUX_SPAWN_EXEMPTION_RE.test(cmd)) return null;
  return deny(
    "spawning `claude` with --dangerously-skip-permissions bypasses every downstream hook at whatever depth the spawned process runs (SEC-DR-B). This is a best-effort text heuristic, not a security boundary \u2014 it cannot see runtime shell evaluation (variable indirection, command substitution, wrapper scripts). The hard guarantee against this bypass is AC-6.4 (native Task-tool spawn in the split path, where no Bash `claude` invocation exists to evade). The only exemption here is the exact-match legacy top-level tmux batch-spawn template, see docs/dev-mode.md \xA7 Outward-Action Gate"
  );
}
var DENIED_BASH = [
  [/\brm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?(\/|~|\$\{?HOME\}?)(\s|$)/i, "rm -rf targeting / ~ or HOME"],
  [/\brm\s+\S*[fF]\S*[rR]\S*\s+(?:--\s+)?(\/|~|\$\{?HOME\}?)(\s|$)/i, "rm -fr targeting / ~ or HOME"],
  [/\brm\s+-r\b.*\s+-f\b.*\s+(?:--\s+)?(\/|~|\$\{?HOME\}?)(\s|$)/i, "rm -r -f targeting / ~ or HOME"],
  [/\brm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?\*(\s|$)/i, "rm -rf with bare wildcard"],
  [/git\s+push\s+(?:[^|]*\s)?(-f\b|--force\b|--force-with-lease)/i, "git push --force"],
  [/git\s+reset\s+--hard\b/i, "git reset --hard"],
  [/git\s+clean\s+(?:[^|]*\s)?-\S*f/i, "git clean -f"],
  [/\bdrop\s+(?:table|database|schema)\b/i, "destructive SQL: DROP"],
  [/\btruncate\s+table\b/i, "destructive SQL: TRUNCATE TABLE"]
];
var FORCE_PUSH_FLAG_VALUES = /* @__PURE__ */ new Set(["-f", "--force", "--force-with-lease"]);
var FORCE_PUSH_FLAG_PREFIXES_WITH_VALUE = ["--force-with-lease="];
var SHORT_FLAG_CLUSTER_WITH_FORCE_RE = /^-[a-zA-Z]*f[a-zA-Z]*$/;
function argsCarryForcePush(args) {
  return args.some(
    (tok) => FORCE_PUSH_FLAG_VALUES.has(tok.value) || FORCE_PUSH_FLAG_PREFIXES_WITH_VALUE.some((prefix) => tok.value.startsWith(prefix)) || SHORT_FLAG_CLUSTER_WITH_FORCE_RE.test(tok.value) || !tok.value.startsWith("-") && tok.value.startsWith("+")
  );
}
function findWrapperAwareForcePush(cmd) {
  for (const effective of analyzeCommand(cmd).commands) {
    const classified = classifyCoveredAction(effective);
    if (classified === null) continue;
    if (classified.binary === "git" && classified.gitSubcommand?.toLowerCase() === "push" && argsCarryForcePush(classified.args)) {
      return true;
    }
  }
  return false;
}
var SENSITIVE_PATHS = [
  /(^|[/\\])\.env(\.|$)/,
  /\.pem$/,
  /(^|[/\\])id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,
  /(^|[/\\])\.ssh[/\\]/,
  /(^|[/\\])\.aws[/\\](credentials|config)$/,
  /(^|[/\\])credentials\.json$/,
  /(^|[/\\])secrets\.(ya?ml|json|toml)$/
];
var SENSITIVE_ALLOWLIST = [".env.example", ".env.sample", ".env.template"];
var EGRESS_READ_PATHS = [
  /(^|[/\\])\.env(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /(^|[/\\])id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,
  /(^|[/\\])\.ssh[/\\]/,
  /(^|[/\\])\.aws[/\\](credentials|config)$/,
  /(^|[/\\])credentials\.json$/,
  /(^|[/\\])secrets\.(ya?ml|json|toml)$/,
  /(^|[/\\])[^/\\]*secret[^/\\]*$/i
];
var CONFIG_WEAKENING_PATHS = /(^|[/\\])(\.eslintrc(\.(js|cjs|json|yaml|yml))?|eslint\.config\.(js|cjs|mjs|ts)|\.prettierrc(\.(js|cjs|json|yaml|yml))?|prettier\.config\.(js|cjs|mjs)|ruff\.toml|\.ruff\.toml|pyproject\.toml|tsconfig.*\.json)$/i;
var CONFIG_WEAKENING_PATTERNS = [
  [/"rules"\s*:\s*\{\s*\}/m, 'rules object emptied ("rules": {})'],
  [/'rules'\s*:\s*\{\s*\}/m, "rules object emptied ('rules': {})"],
  [/\/\*\s*eslint-disable\b/m, "broad eslint-disable block comment"],
  [/\/\/\s*eslint-disable\b(?!\s*eslint-enable)/m, "eslint-disable line comment (no matching enable)"],
  [/"extends"\s*:\s*\[\s*\]/m, 'extends array emptied ("extends": [])'],
  [/"plugins"\s*:\s*\{\s*\}/m, "plugins object emptied"],
  [/"noImplicitAny"\s*:\s*false/m, "TypeScript noImplicitAny disabled"],
  [/"strict"\s*:\s*false/m, "TypeScript strict mode disabled"],
  [/select\s*=\s*\[\s*\]/m, "ruff: all rules deselected"],
  [/ignore-errors\s*=\s*true/m, "ruff: ignore-errors enabled"]
];
var HIGH_CONFIDENCE_SECRETS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key (AKIA\u2026 pattern)"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "GitHub personal access token (ghp_\u2026 pattern)"],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "GitHub fine-grained PAT (github_pat_\u2026 pattern)"],
  [/-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----/, "PEM private key header"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, "Anthropic API key (sk-ant-\u2026 pattern)"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/, "OpenAI-style secret key (sk-\u2026 pattern)"],
  [/\bAIza[0-9A-Za-z_\-]{35}\b/, "Google API key (AIza\u2026 pattern)"],
  [/\b[rs]k_live_[0-9A-Za-z]{16,}\b/, "Stripe live secret key (sk_live_/rk_live_ pattern)"],
  [/\bglpat-[0-9A-Za-z_\-]{20}\b/, "GitLab personal access token (glpat-\u2026 pattern)"],
  [/\bgh[osru]_[A-Za-z0-9]{36}\b/, "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)"],
  [/\bxoxb-[A-Za-z0-9-]{10,}\b/, "Slack bot token (xoxb-\u2026 pattern)"],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, "SendGrid API key (SG.\u2026 pattern)"],
  [/\bAC[0-9a-f]{32}\b/, "Twilio account SID (AC\u2026 pattern)"],
  [/\bSK[0-9a-f]{32}\b/, "Twilio API key SID (SK\u2026 pattern)"]
];
var MEDIUM_CONFIDENCE_SECRETS_FIXED = [
  [
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    "possible JWT token (eyJ\u2026 three-segment base64url pattern)"
  ],
  [
    /\bBearer\s+[A-Za-z0-9_/+.=-]{20,}\b/,
    "possible Bearer token (Bearer \u2026 keyword pattern)"
  ],
  [
    /\bsv=[0-9]{4}-[0-9]{2}-[0-9]{2}&[^\s'"]{30,}\b/,
    "possible Azure SAS token (sv=\u2026 signature pattern)"
  ]
];
var MEDIUM_CONFIDENCE_PATTERN = /(?:^|[\s\x00-\x1f])(?:\w+_)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*["']?([A-Za-z0-9_/+.]{20,})["']?/gim;
function shannonEntropy(value) {
  if (!value) return 0;
  const freq = /* @__PURE__ */ new Map();
  for (const ch of value) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  const n = value.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
function shellSplit(cmd) {
  const tokens = [];
  let current = "";
  let i = 0;
  let inDQ = false;
  let inSQ = false;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (inSQ) {
      if (ch === "'") {
        inSQ = false;
      } else {
        current += ch;
      }
      i++;
      continue;
    }
    if (inDQ) {
      if (ch === '"') {
        inDQ = false;
      } else if (ch === "\\") {
        i++;
        if (i < cmd.length) {
          const nc = cmd[i];
          if (nc === '"' || nc === "\\" || nc === "$" || nc === "`") {
            current += nc;
          } else {
            current += "\\" + nc;
          }
        }
      } else {
        current += ch;
      }
      i++;
      continue;
    }
    if (ch === " " || ch === "	" || ch === "\n") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else if (ch === '"') {
      inDQ = true;
    } else if (ch === "'") {
      inSQ = true;
    } else if (ch === "\\") {
      i++;
      if (i < cmd.length) {
        current += cmd[i];
      }
    } else {
      current += ch;
    }
    i++;
  }
  if (inDQ || inSQ) return null;
  if (current.length > 0) tokens.push(current);
  return tokens;
}
function checkNoVerifyTokenized(cmd) {
  if (!/\bgit\b/i.test(cmd)) return false;
  if (!/\b(commit|rebase|push)\b/i.test(cmd)) return false;
  const tokens = shellSplit(cmd);
  if (tokens === null) {
    return false;
  }
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["-m", "--message", "-F", "--file", "-t", "--template"]);
  let skipNext = false;
  let inGitSubcommand = false;
  let sawGit = false;
  let gitSubcommand = "";
  let pendingC = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!sawGit) {
      if (tok === "git" || tok.endsWith("/git") || tok.endsWith("\\git")) {
        sawGit = true;
      }
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (pendingC) {
      pendingC = false;
      if (/core\.hooksPath\s*=/i.test(tok)) return true;
      continue;
    }
    if (!inGitSubcommand && !tok.startsWith("-")) {
      inGitSubcommand = true;
      gitSubcommand = tok.toLowerCase();
      continue;
    }
    if (VALUE_FLAGS.has(tok)) {
      skipNext = true;
      continue;
    }
    if (tok.startsWith("--message=") || tok.startsWith("--file=")) {
      continue;
    }
    if (tok === "-c") {
      pendingC = true;
      continue;
    }
    if (tok.startsWith("-c=")) {
      const kv = tok.slice(3);
      if (/core\.hooksPath\s*=/i.test(kv)) return true;
      continue;
    }
    if (tok === "--no-verify" || "--no-verify".startsWith(tok) && tok.startsWith("--no-v")) {
      return true;
    }
    if (gitSubcommand === "commit" && /^-[A-Za-z]*n[A-Za-z]*$/.test(tok)) {
      return true;
    }
  }
  return false;
}
function scanForSecrets(content) {
  for (const [pattern, label] of HIGH_CONFIDENCE_SECRETS) {
    if (pattern.test(content)) {
      return deny(`high-confidence secret detected: ${label}`);
    }
  }
  for (const [pattern, label] of MEDIUM_CONFIDENCE_SECRETS_FIXED) {
    if (pattern.test(content)) {
      return ask(`possible secret detected: ${label}`);
    }
  }
  MEDIUM_CONFIDENCE_PATTERN.lastIndex = 0;
  let match;
  while ((match = MEDIUM_CONFIDENCE_PATTERN.exec(content)) !== null) {
    const candidate = (match[1] ?? "").replace(/["']$/, "");
    if (candidate.length >= 20 && shannonEntropy(candidate) >= 3.5) {
      const raw = match[0].trimStart();
      const keyword = (raw.split("=")[0] ?? raw.split(":")[0] ?? raw).trim();
      return ask(`high-entropy ${keyword}= assignment (medium-confidence secret)`);
    }
  }
  return null;
}
function evaluate(input) {
  const toolName = input.tool?.name ?? "";
  const toolInput = input.tool?.input ?? {};
  if (toolName === "Bash") {
    const cmd = typeof toolInput["command"] === "string" ? toolInput["command"] : "";
    if (!cmd) return none();
    const skipPermissionsDecision = evaluateClaudeSkipPermissionsSpawn(cmd);
    if (skipPermissionsDecision) return skipPermissionsDecision;
    for (const [pattern, label] of DENIED_BASH) {
      if (pattern.test(cmd)) return deny(label);
    }
    if (findWrapperAwareForcePush(cmd)) return deny("git push --force");
    if (checkNoVerifyTokenized(cmd)) {
      return deny("--no-verify (bypasses pre-commit hooks)");
    }
    const curlCarriesData = /\bcurl\b.*(?:--data(?:-[a-z]+)?\b|\s-d\b|--json\b|\s-F\b|--form\b)/i.test(cmd);
    const curlCarriesAuthHeader = /\bcurl\b.*(?:-H|--header)\s+['"]?Authorization:\s*Bearer\b/i.test(cmd);
    const shouldScanBash = /\bgit\s+commit\b/.test(cmd) || curlCarriesData || curlCarriesAuthHeader || /\bwget\b.*--post-(?:data|file)\b/i.test(cmd) || /\btee\b/.test(cmd) || /\bexport\s+\w+\s*=/.test(cmd) || /\benv\s+\w+=/.test(cmd);
    if (shouldScanBash) {
      const secretDecision = scanForSecrets(cmd);
      if (secretDecision !== null) return secretDecision;
    }
    return none();
  }
  if (toolName === "Read") {
    const rawPath = typeof toolInput["file_path"] === "string" ? toolInput["file_path"] : "";
    const filePath = rawPath.replace(/\\/g, "/");
    if (SENSITIVE_ALLOWLIST.some((suffix) => filePath.endsWith(suffix))) {
      return none();
    }
    for (const pattern of EGRESS_READ_PATHS) {
      if (pattern.test(filePath)) {
        return askReason(
          `reading a potential secret/credential file ('${rawPath}'). Confirm this read is intentional and the file does not contain live secrets.`
        );
      }
    }
    return none();
  }
  if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    const rawPath = typeof toolInput["file_path"] === "string" ? toolInput["file_path"] : "";
    const filePath = rawPath.replace(/\\/g, "/");
    if (SENSITIVE_ALLOWLIST.some((suffix) => filePath.endsWith(suffix))) {
      return none();
    }
    for (const pattern of SENSITIVE_PATHS) {
      if (pattern.test(filePath)) {
        return deny(`writing to sensitive file '${rawPath}'`);
      }
    }
    if (CONFIG_WEAKENING_PATHS.test(filePath)) {
      const contentField2 = toolName === "Write" ? "content" : toolName === "Edit" ? "new_string" : "new_source";
      const contentToCheck = typeof toolInput[contentField2] === "string" ? toolInput[contentField2] : "";
      if (contentToCheck) {
        for (const [pattern, label] of CONFIG_WEAKENING_PATTERNS) {
          if (pattern.test(contentToCheck)) {
            return askReason(
              `edit may weaken linter/formatter config '${rawPath}' (${label}). Confirm this change is intentional.`
            );
          }
        }
      }
    }
    const contentField = toolName === "Write" ? "content" : toolName === "Edit" ? "new_string" : "new_source";
    const content = typeof toolInput[contentField] === "string" ? toolInput[contentField] : "";
    if (content) {
      const secretDecision = scanForSecrets(content);
      if (secretDecision !== null) return secretDecision;
    }
    return none();
  }
  return none();
}

// entry/policy-block.cc.ts
var PARSE_FAILURE_MESSAGES = [
  "SEC-07: payload is not valid JSON",
  "SEC-07: payload must be a JSON object"
];
function isParseFailure(err) {
  return PARSE_FAILURE_MESSAGES.some((msg) => err.message === msg);
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
  try {
    const normalized = inboundCC(raw);
    const decision = evaluate(normalized);
    outboundCC(decision);
  } catch (err) {
    if (err instanceof ShimRejectError && isParseFailure(err)) {
      if (raw.trim().length === 0) {
        outboundCC({ decision: "none", reason: "", mutations: null });
      } else {
        const fallback = {
          decision: "ask",
          reason: "policy-block: payload is non-empty but failed to parse as JSON \u2014 cannot evaluate safety. Manual review required before proceeding (policy-block.cc.ts SEC-07).",
          mutations: null
        };
        outboundCC(fallback);
      }
    } else if (err instanceof ShimRejectError) {
      const fallback = {
        decision: "ask",
        reason: "policy-block: payload failed shim validation (size/depth/pollution guard) \u2014 cannot evaluate safety. Manual review required before proceeding (policy-block.cc.ts SEC-07).",
        mutations: null
      };
      outboundCC(fallback);
    } else {
      const fallback = {
        decision: "ask",
        reason: "policy-block: internal error during evaluation \u2014 proceeding requires manual confirmation (policy-block.cc.ts).",
        mutations: null
      };
      outboundCC(fallback);
    }
  }
}
main().catch(() => {
  process.exit(0);
});
