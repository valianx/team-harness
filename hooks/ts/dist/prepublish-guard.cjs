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
var SHIPPED_PATH_RE = /^(agents|skills|hooks)\//;
var RELEASE_BRANCH_RE = /^release\/v([0-9]+\.[0-9]+\.[0-9]+)$/;
var FRAGMENT_RE = /^changelog\.d\/[a-z0-9-]+\.md$/;
var MARKER_RE = /^version\.d\/[a-z0-9-]+\.bump$/;
var CLAUDE_VERSION_RE = /\*\*Current version:\*\* `([0-9]+\.[0-9]+\.[0-9]+)`/;
var OVERRIDE_TOKEN_RE = /^bump-override: (minor|major) — .+$/m;
var CONTROL_CHAR_RE = /[\x00-\x09\x0b-\x1f\x7f]/;
function semverDelta(oldVer, newVer) {
  const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
  if (!SEMVER_RE.test(oldVer) || !SEMVER_RE.test(newVer)) return "unknown";
  const [oM, oMin, oP] = oldVer.split(".").map(Number);
  const [nM, nMin, nP] = newVer.split(".").map(Number);
  if (nM > oM) return "major";
  if (nM === oM && nMin > oMin) return "minor";
  if (nM === oM && nMin === oMin && nP > oP) return "patch";
  if (nM === oM && nMin === oMin && nP === oP) return "none";
  return "unknown";
}
function rankOf(level) {
  switch (level) {
    case "none":
      return 0;
    case "patch":
      return 1;
    case "minor":
      return 2;
    case "major":
      return 3;
    default:
      return -1;
  }
}
function extractJsonVersion(content) {
  if (!content) return "";
  try {
    const obj = JSON.parse(content);
    return typeof obj["version"] === "string" ? obj["version"] : "";
  } catch {
    return "";
  }
}
function extractMarketVersion(content) {
  if (!content) return "";
  try {
    const obj = JSON.parse(content);
    const plugins = obj["plugins"];
    if (Array.isArray(plugins) && plugins.length > 0) {
      const first = plugins[0];
      return typeof first["version"] === "string" ? first["version"] : "";
    }
    return "";
  } catch {
    return "";
  }
}
function extractClaudeVersion(content) {
  if (!content) return "";
  const m = CLAUDE_VERSION_RE.exec(content);
  return m ? m[1] : "";
}
function isBumped(head, origin) {
  if (head && origin) return head !== origin;
  if (head && !origin) return true;
  return false;
}
function readVersionSites(reader) {
  const pluginHead = extractJsonVersion(reader.readFile(".claude-plugin/plugin.json"));
  const marketHead = extractMarketVersion(reader.readFile(".claude-plugin/marketplace.json"));
  const claudeHead = extractClaudeVersion(reader.readFile("CLAUDE.md"));
  const pluginOrigin = extractJsonVersion(reader.gitShow("origin/main:.claude-plugin/plugin.json"));
  const marketOrigin = extractMarketVersion(reader.gitShow("origin/main:.claude-plugin/marketplace.json"));
  const claudeOrigin = extractClaudeVersion(reader.gitShow("origin/main:CLAUDE.md"));
  return {
    pluginHead,
    pluginOrigin,
    pluginBumped: isBumped(pluginHead, pluginOrigin),
    marketHead,
    marketOrigin,
    marketBumped: isBumped(marketHead, marketOrigin),
    claudeHead,
    claudeOrigin,
    claudeBumped: isBumped(claudeHead, claudeOrigin)
  };
}
function resolveBranch(reader) {
  const raw = reader.gitCurrentBranch();
  if (raw === null) return null;
  const branch = CONTROL_CHAR_RE.test(raw) ? "__invalid__" : raw;
  const m = RELEASE_BRANCH_RE.exec(branch);
  return m ? { isRelease: true, version: m[1] } : { isRelease: false, version: "" };
}
function deriveFloor(changed) {
  let sawAdded = false;
  let sawRemovedOrRenamed = false;
  let sawModified = false;
  for (const { status, path: path2 } of changed) {
    if (!SHIPPED_PATH_RE.test(path2)) continue;
    const kind = status.charAt(0);
    if (kind === "A") sawAdded = true;
    else if (kind === "D" || kind === "R") sawRemovedOrRenamed = true;
    else sawModified = true;
  }
  if (sawRemovedOrRenamed) return "major";
  if (sawAdded) return "minor";
  if (sawModified) return "patch";
  return "none";
}
function hasFragmentOrMarker(changed) {
  return changed.some((c) => FRAGMENT_RE.test(c.path) || MARKER_RE.test(c.path));
}
function findOverrideToken(reader) {
  let src = "";
  const commitMsg = reader.readEnv("GIT_COMMIT_MSG");
  if (commitMsg) src += commitMsg;
  const count = parseInt(reader.readEnv("GIT_PUSH_OPTION_COUNT") ?? "0", 10);
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i++) {
      const opt = reader.readEnv(`GIT_PUSH_OPTION_${i}`);
      if (opt) src += `
${opt}`;
    }
  }
  if (!src) return false;
  if (CONTROL_CHAR_RE.test(src)) {
    reader.warn(
      "prepublish-guard: bump-override source contains control characters; treating as absent (SEC-DR-A). Over-bump check proceeds."
    );
    return false;
  }
  return OVERRIDE_TOKEN_RE.test(src);
}
function runNoAssetAdvisory(reader, pluginOrigin, pluginHead) {
  if (!pluginOrigin || !pluginHead) return;
  const actual = semverDelta(pluginOrigin, pluginHead);
  if (actual === "unknown") return;
  if (rankOf(actual) >= rankOf("minor")) {
    reader.warn(
      `prepublish-guard: WARN \u2014 no distributed asset (agents/|skills/|hooks/) changed in this diff, but the version bump is ${actual} (>= MINOR). A docs/tests/CI-only change is typically none or PATCH. Confirm the level is intentional. (advisory; push not blocked)`
    );
  }
}
function runFeaturePath(reader, changed, sites) {
  if (sites.pluginBumped || sites.marketBumped || sites.claudeBumped) {
    return deny(
      "prepublish-guard: feature branch (non-release/vX.Y.Z) strays a version bump on a version site. Version bumps are reserved for release/vX.Y.Z branches cut by /th:release. Remove the version change or use the release flow. Push blocked."
    );
  }
  if (!hasFragmentOrMarker(changed)) {
    return deny(
      "prepublish-guard: distributed assets (agents/|skills/|hooks/) changed but neither a changelog.d/ fragment nor a version.d/ marker was found in the diff. Write a changelog.d/{pr-slug}.md fragment (for user-visible changes) or a version.d/{pr-slug}.bump marker (for internal consumer-received changes with no changelog entry) and re-push. See CLAUDE.md \xA76.3 and agents/delivery.md Step 9. Push blocked."
    );
  }
  return null;
}
function runReleasePath(reader, changed, branchVersion, sites) {
  if (!sites.pluginBumped || !sites.marketBumped) {
    return deny(
      "prepublish-guard: release branch requires all three version sites bumped (.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CLAUDE.md \xA73), but at least one was not changed vs origin/main. Bump all three to the same X.Y.Z matching the branch name and re-push. Push blocked."
    );
  }
  if (sites.claudeHead && !sites.claudeBumped) {
    return deny(
      "prepublish-guard: release branch requires all three version sites bumped (.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CLAUDE.md \xA73), but CLAUDE.md \xA73 was not changed vs origin/main. Bump all three to the same X.Y.Z matching the branch name and re-push. Push blocked."
    );
  }
  if (branchVersion && sites.pluginHead && sites.pluginHead !== branchVersion) {
    return deny(
      `prepublish-guard: release branch is release/v${branchVersion} but .claude-plugin/plugin.json version is '${sites.pluginHead}'. They must match. Update the version files to ${branchVersion} or rename the branch. Push blocked.`
    );
  }
  if (branchVersion && sites.marketHead && sites.marketHead !== branchVersion) {
    return deny(
      `prepublish-guard: release branch is release/v${branchVersion} but .claude-plugin/marketplace.json plugins[0].version is '${sites.marketHead}'. They must match. Push blocked.`
    );
  }
  if (branchVersion && sites.claudeHead && sites.claudeHead !== branchVersion) {
    return deny(
      `prepublish-guard: release branch is release/v${branchVersion} but CLAUDE.md \xA73 Current version is '${sites.claudeHead}'. All three version sites must match the branch version. Push blocked.`
    );
  }
  return runBumpFloorSubstage(reader, changed, sites.pluginOrigin, sites.pluginHead);
}
function warnUnderBump(reader, floor, actual) {
  if (floor === "major") {
    reader.warn(
      `prepublish-guard: WARN \u2014 a shipped asset was DELETED or RENAMED (removed public surface) but the version bump is ${actual}. SemVer suggests MAJOR. If the deleted/renamed file is not a public invocable surface (e.g. an internal include), ignore. (advisory; push not blocked)`
    );
  } else if (floor === "minor") {
    reader.warn(
      `prepublish-guard: WARN \u2014 a NEW shipped file was added (new invocable surface) but the version bump is ${actual}. SemVer suggests MINOR. If the new file is not a new invocable surface (e.g. a _shared include), ignore. (advisory; push not blocked)`
    );
  }
}
function resolveOverBump(reader, floor, actual) {
  if (findOverrideToken(reader)) {
    reader.warn(`prepublish-guard: over-bump allowed by bump-override token (actual=${actual} floor=${floor})`);
    return null;
  }
  return deny(
    `prepublish-guard: version bump level exceeds the mechanical SemVer floor for this diff. The changed shipped paths (agents/|skills/|hooks/) only warrant a ${floor} bump, but a ${actual} was applied. If this over-bump is intentional (e.g. a fix + new surface in the same PR), add a commit trailer or push option: bump-override: ${actual} \u2014 <reason>. See CLAUDE.md \xA76.3 and agents/delivery.md Step 9. Push blocked.`
  );
}
function runBumpFloorSubstage(reader, changed, pluginOrigin, pluginHead) {
  const floor = deriveFloor(changed);
  const actual = semverDelta(pluginOrigin, pluginHead);
  if (actual === "unknown") {
    reader.warn(
      `prepublish-guard: version not X.Y.Z (old=${pluginOrigin} new=${pluginHead}); skipping bump-floor check`
    );
    return null;
  }
  const rankActual = rankOf(actual);
  const rankFloor = rankOf(floor);
  if (rankActual < rankFloor) warnUnderBump(reader, floor, actual);
  if (rankActual > rankFloor) return resolveOverBump(reader, floor, actual);
  return null;
}
function runVersionBumpCheck(reader) {
  if (!reader.fileExists(".claude-plugin/plugin.json")) {
    return null;
  }
  const changed = reader.gitDiffNameStatus();
  if (changed === null) {
    return null;
  }
  const touchesAssets = changed.some((c) => SHIPPED_PATH_RE.test(c.path));
  if (!touchesAssets) {
    const pluginHead = extractJsonVersion(reader.readFile(".claude-plugin/plugin.json"));
    const pluginOrigin = extractJsonVersion(reader.gitShow("origin/main:.claude-plugin/plugin.json"));
    runNoAssetAdvisory(reader, pluginOrigin, pluginHead);
    return null;
  }
  const branch = resolveBranch(reader);
  if (branch === null) return null;
  const sites = readVersionSites(reader);
  if (!branch.isRelease) {
    return runFeaturePath(reader, changed, sites);
  }
  return runReleasePath(reader, changed, branch.version, sites);
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
    gitDiffNameStatus() {
      try {
        const out = (0, import_node_child_process.execFileSync)("git", ["diff", "--name-status", "origin/main...HEAD"], {
          encoding: "utf8",
          env: { ...process.env, MSYS_NO_PATHCONV: "1" }
        });
        return out.split("\n").filter((line) => line.trim().length > 0).map((line) => {
          const fields = line.split("	");
          const status = fields[0] ?? "";
          const filePath = fields.length > 2 ? fields[fields.length - 1] : fields[1] ?? "";
          return { status, path: filePath };
        });
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
    gitCurrentBranch() {
      try {
        return (0, import_node_child_process.execFileSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    },
    readEnv(name) {
      return process.env[name];
    },
    warn(msg) {
      process.stderr.write(msg + "\n");
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
      "prepublish-guard: payload cwd contains control characters; skipping cd (SEC-DR-A, fail-open)\n"
    );
    return;
  }
  if (!isDirectory(cwd)) {
    process.stderr.write("prepublish-guard: payload cwd does not exist as a directory; skipping cd (fail-open)\n");
    return;
  }
  try {
    process.chdir(cwd);
  } catch {
    process.stderr.write("prepublish-guard: cd into payload cwd failed; continuing with process CWD (fail-open)\n");
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
