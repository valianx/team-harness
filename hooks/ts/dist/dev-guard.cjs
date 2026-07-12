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

// entry/dev-guard.cc.ts
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

// bodies/dev-guard.ts
function ask(reason) {
  return { decision: "ask", reason, mutations: null };
}
function allow(reason) {
  return { decision: "allow", reason, mutations: null };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
var CLICKUP_WRITE_RE = /^mcp__.+__clickup_(update_task|create_task|create_task_comment|attach_task_file|delete_task)$/;
var GIT_PUSH_RE = /(^|[\s|;&<>()`])git(\s+-C\s+\S+|\s+--git-dir(?:=\S+|\s+\S+)|\s+--work-tree(?:=\S+|\s+\S+)|\s+-\S*|\s+\S+=\S+)*\s+push(\s|$|[;&|<>()`"'$])/i;
var GH_PR_CREATE_RE = /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+create(\s|$|[;&|<>()`"'$])/i;
var GH_PR_MERGE_RE = /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+merge(\s|$|[;&|<>()`"'$])/i;
var GH_PR_REVIEW_RE = /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+review(\s|$|[;&|<>()`"'$])/i;
var GH_PR_COMMENT_RE = /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+comment(\s|$|[;&|<>()`"'$])/i;
var GH_API_REST_PR_RE = /(^|[\s|;&<>()`])gh\s+api\s+.*(-X|--method)\s*(PUT|POST|PATCH|DELETE).*pulls/i;
var GH_GRAPHQL_RE = /(^|[\s|;&<>()`])gh\s+api\s+graphql/i;
var GRAPHQL_PR_MUTATIONS_RE = /(resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|addPullRequestReviewComment|addPullRequestReview|submitPullRequestReview|mergePullRequest)/;
var GH_ISSUE_WRITE_RE = /(^|[\s|;&<>()`])gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?issue\s+(create|edit|comment)(\s|$|[;&|<>()`"'$])/i;
var GH_REPO_FLAG_VALUE_RE = /(?:--repo|-R)(?:=(\S+)|\s+(\S+))/;
function extractGhRepoTarget(cmdStr) {
  const m = GH_REPO_FLAG_VALUE_RE.exec(cmdStr);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}
var CURL_WGET_MUTATING_RE = /(^|[\s|;&<>()`])(curl|wget)\s.*(-X|--request)\s*(PUT|POST|PATCH|DELETE).*api\.github\.com/i;
var API_GITHUB_URL_RE = /api\.github\.com/i;
var MUTATING_METHOD_RE = /(-X|--request)\s*(PUT|POST|PATCH|DELETE)/i;
var RAW_OUTWARD_SCAN_RE = /(git\s+push|gh\s+pr\s+(create|merge|review|comment)|gh\s+issue\s+(create|edit|comment)|gh\s+api.*pulls|api\.github\.com)/i;
var SHELL_QUOTING_OR_EXPANSION_RE = /["'\\$]/;
var SHELL_COMPOSITION_RE = /[;&|`\n<>]|\$\(/;
var TREE_OR_ENV_REDIRECT_RE = /((^|\s)-C(?=[\s/=]|$)|--git-dir\b|--work-tree\b|\bGIT_[A-Z_]+=)/;
var GIT_PUSH_EXACT_RE = /^git\s+push(\s|$)/;
var GIT_C_DIR_PUSH_EXACT_RE = /^git\s+-C\s+(\S+)\s+push(\s|$)/;
var GH_PR_CREATE_EXACT_RE = /^gh\s+(?:(?:--repo|-R)(?:=\S+|\s+\S+)\s+)?pr\s+create(\s|$)/;
var BENIGN_PUSH_FLAG_RE = /^(-u|--set-upstream|-v|--verbose|--progress)$/;
var TAG_LIKE_RE = /^[vV]?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$/;
var PLAIN_BRANCH_NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
var REF_NAMESPACE_WORDS = /* @__PURE__ */ new Set(["refs", "heads", "tags", "remotes"]);
var DEFAULT_BRANCH_FLOOR = /* @__PURE__ */ new Set(["main", "master"]);
var GATE_DOC_POINTER = "see docs/dev-mode.md \xA7 Outward-Action Gate";
function rejectShellQuotingOrComposition(cmdStr) {
  if (SHELL_QUOTING_OR_EXPANSION_RE.test(cmdStr) || SHELL_COMPOSITION_RE.test(cmdStr)) {
    return ask(
      `outward action 'git push' contains a shell quoting/escaping/expansion/composition character \u2014 the inspected token cannot be trusted to equal the value bash actually runs; fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return null;
}
function rejectTreeOrEnvRedirect(cmdStr) {
  if (TREE_OR_ENV_REDIRECT_RE.test(cmdStr)) {
    return ask(
      `outward action 'git push' combined with a tree/directory redirection (--git-dir, --work-tree, a GIT_*= environment prefix, a glued/second/misplaced -C) requires explicit operator approval \u2014 the payload-cwd reader would evaluate a different tree than the one git operates on; only the single, spaced 'git -C {dir} push ...' shape is resolved against a real target (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return null;
}
function extractExactPushTail(trimmedCmd) {
  const m = GIT_PUSH_EXACT_RE.exec(trimmedCmd);
  return m ? trimmedCmd.slice(m[0].length).trim() : null;
}
function extractExactCDirPushTail(trimmedCmd) {
  const m = GIT_C_DIR_PUSH_EXACT_RE.exec(trimmedCmd);
  if (!m) return null;
  return { dir: m[1], tail: trimmedCmd.slice(m[0].length).trim() };
}
function isPlainBranchDestination(dst) {
  if (!PLAIN_BRANCH_NAME_RE.test(dst)) return false;
  const firstSegment = dst.split("/")[0].toLowerCase();
  return !REF_NAMESPACE_WORDS.has(firstSegment);
}
function evaluateDestinationBranch(dst, reader, allowContext, dir) {
  const targetNote = dir !== void 0 ? ` (target '-C ${dir}')` : "";
  if (DEFAULT_BRANCH_FLOOR.has(dst.toLowerCase())) {
    return ask(
      `outward action 'git push' to '${dst}'${targetNote} \u2014 the static {main, master} floor always requires explicit operator approval, never allow (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  const resolvedDefault = dir !== void 0 ? reader.resolveDefaultBranch(dir) : reader.resolveDefaultBranch();
  if (!resolvedDefault) {
    return ask(
      `outward action 'git push' to '${dst}'${targetNote} \u2014 the target repository's real default branch could not be positively resolved (requires origin/HEAD); fail-closed rather than assume '${dst}' is non-default (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (dst.toLowerCase() === resolvedDefault.toLowerCase()) {
    return ask(
      `outward action 'git push' to the default branch '${dst}'${targetNote} requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return allow(
    `${allowContext} \u2014 destination '${dst}'${targetNote} positively confirmed non-default via origin/HEAD (dev-guard.ts); ${GATE_DOC_POINTER}`
  );
}
function evaluateBarePushAt(dir, reader) {
  const pushRef = reader.resolveEffectivePushRemoteRef(dir);
  if (pushRef === null) {
    return ask(
      `outward action 'git -C ${dir} push' (no refspec) \u2014 the effective push destination could not be resolved for the target directory (no configured upstream/push target); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  const slashIdx = pushRef.indexOf("/");
  const remote = slashIdx >= 0 ? pushRef.slice(0, slashIdx) : pushRef;
  const destBranch = slashIdx >= 0 ? pushRef.slice(slashIdx + 1) : "";
  if (remote !== "origin") {
    return ask(
      `outward action 'git -C ${dir} push' (no refspec) \u2014 the effective push-remote for the target directory resolves to '${remote}', not 'origin' by name (branch.<n>.pushRemote/remote.pushDefault honored); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (!destBranch || !isPlainBranchDestination(destBranch)) {
    return ask(
      `outward action 'git -C ${dir} push' (no refspec) \u2014 the effective push destination branch could not be extracted from '${pushRef}' as a plain branch name; fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return evaluateDestinationBranch(
    destBranch,
    reader,
    `bare 'git -C ${dir} push' resolved to non-default branch '${destBranch}' with effective remote 'origin' (target directory)`,
    dir
  );
}
function evaluateBarePush(reader, dir) {
  if (dir !== void 0) return evaluateBarePushAt(dir, reader);
  const pushRef = reader.resolveEffectivePushRemoteRef();
  if (pushRef === null) {
    return ask(
      `outward action 'git push' (no refspec) \u2014 the effective push destination could not be resolved (no configured upstream/push target); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  const slashIdx = pushRef.indexOf("/");
  const remote = slashIdx >= 0 ? pushRef.slice(0, slashIdx) : pushRef;
  const destBranch = slashIdx >= 0 ? pushRef.slice(slashIdx + 1) : "";
  if (remote !== "origin") {
    return ask(
      `outward action 'git push' (no refspec) \u2014 the effective push-remote resolves to '${remote}', not 'origin' by name (branch.<n>.pushRemote/remote.pushDefault honored); fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (!destBranch || !isPlainBranchDestination(destBranch)) {
    return ask(
      `outward action 'git push' (no refspec) \u2014 the effective push destination branch could not be extracted from '${pushRef}' as a plain branch name; fail-closed (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return evaluateDestinationBranch(
    destBranch,
    reader,
    `bare 'git push' resolved to non-default branch '${destBranch}' with effective remote 'origin'`
  );
}
function extractRawDestination(refspec) {
  const colonIdx = refspec.lastIndexOf(":");
  if (colonIdx < 0) return refspec;
  const src = refspec.slice(0, colonIdx);
  if (src === "") return null;
  const afterColon = refspec.slice(colonIdx + 1);
  return afterColon === "" ? src : afterColon;
}
function resolveSymbolicDestination(rawDst, reader, dir) {
  if (rawDst === "HEAD" || rawDst === "@") {
    return dir !== void 0 ? reader.gitCurrentBranch(dir) : reader.gitCurrentBranch();
  }
  if (rawDst.startsWith("@")) return null;
  return rawDst;
}
function evaluateSingleRefspec(refspec, reader, dir) {
  if (refspec.startsWith("+")) {
    return ask(
      `outward action 'git push' with a '+' force-prefixed refspec requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  const rawDst = extractRawDestination(refspec);
  if (rawDst === null) {
    return ask(
      `outward action 'git push' with an empty-source (delete) refspec requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (TAG_LIKE_RE.test(rawDst)) {
    return ask(
      `outward action 'git push' to a tag ref requires explicit operator approval (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  const dst = resolveSymbolicDestination(rawDst, reader, dir);
  if (dst === null) {
    return ask(
      `outward action 'git push' with an unresolved symbolic destination ('${rawDst}') requires explicit operator approval \u2014 resolution is attempted only for bare HEAD/@; fail-closed on any other shorthand or resolution fault (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (!isPlainBranchDestination(dst)) {
    return ask(
      `outward action 'git push' with a destination that is not a plain branch name ('${dst}') requires explicit operator approval \u2014 fail-closed on any ref-namespace-qualified or malformed destination (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return evaluateDestinationBranch(
    dst,
    reader,
    `single refspec push to non-default branch '${dst}' on 'origin' recognized as the closed safe form`,
    dir
  );
}
function evaluatePushArgs(tail, reader, dir) {
  const targetLabel = dir !== void 0 ? `'git -C ${dir} push'` : "'git push'";
  const tokens = tail.length > 0 ? tail.split(/\s+/).filter(Boolean) : [];
  const flagTokens = tokens.filter((t) => t.startsWith("-"));
  const positional = tokens.filter((t) => !t.startsWith("-"));
  const disqualifyingFlags = flagTokens.filter((t) => !BENIGN_PUSH_FLAG_RE.test(t));
  if (disqualifyingFlags.length > 0) {
    return ask(
      `outward action ${targetLabel} with disqualifying flag(s) (${disqualifyingFlags.join(", ")}) requires explicit operator approval \u2014 only -u/--set-upstream/-v/--verbose/--progress are on the benign allowlist (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (positional.length === 0) {
    return evaluateBarePush(reader, dir);
  }
  const remoteToken = positional[0];
  if (remoteToken !== "origin") {
    return ask(
      `outward action ${targetLabel} to a remote other than 'origin' (resolved by NAME) requires explicit operator approval \u2014 origin-URL integrity is a model assumption, and 'git remote set-url|add|rename|set-head' stay outside this allowlist (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  if (positional.length === 1) {
    return evaluateBarePush(reader, dir);
  }
  if (positional.length > 2) {
    return ask(
      `outward action ${targetLabel} with more than one refspec requires explicit operator approval \u2014 the recognizer allows exclusively a single simple refspec (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return evaluateSingleRefspec(positional[1], reader, dir);
}
function evaluateGitPush(cmdStr, reader) {
  const quotingReject = rejectShellQuotingOrComposition(cmdStr);
  if (quotingReject) return quotingReject;
  const trimmed = cmdStr.trim();
  const cDirForm = extractExactCDirPushTail(trimmed);
  if (cDirForm) {
    return evaluatePushArgs(cDirForm.tail, reader, cDirForm.dir);
  }
  const redirectReject = rejectTreeOrEnvRedirect(cmdStr);
  if (redirectReject) return redirectReject;
  const tail = extractExactPushTail(trimmed);
  if (tail === null) {
    return ask(
      `outward action 'git push' is not expressed as a single, bare 'git push ...' invocation with nothing preceding it \u2014 fail-closed on any other structure (dev-guard.ts); ${GATE_DOC_POINTER}`
    );
  }
  return evaluatePushArgs(tail, reader);
}
function isPrCreateAutogateEnabled(reader) {
  const config = reader.readConfig();
  if (!config) return false;
  const autogate = config["autogate"];
  if (!autogate || typeof autogate !== "object") return false;
  return autogate["pr_create"] === true;
}
function evaluate(input, reader) {
  const toolName = input.tool?.name ?? "";
  if (toolName && CLICKUP_WRITE_RE.test(toolName)) {
    return ask(
      `outward action \u2014 ClickUp MCP outward write (${toolName}) requires explicit operator approval; preview the change before confirming (dev-guard.ts; see docs/dev-mode.md)`
    );
  }
  const cmd = input.tool?.input?.["command"];
  const cmdStr = typeof cmd === "string" ? cmd : null;
  if (cmdStr === null && toolName === "Bash") {
    const rawRepr = JSON.stringify(input.tool?.input ?? {});
    if (RAW_OUTWARD_SCAN_RE.test(rawRepr)) {
      return ask(
        "outward action detected in raw payload (escape-aware extraction fallback); requires explicit operator approval (dev-guard.ts)"
      );
    }
    return none();
  }
  if (cmdStr === null) {
    return none();
  }
  if (GIT_PUSH_RE.test(cmdStr)) {
    return evaluateGitPush(cmdStr, reader);
  }
  const ghTargetRepo = extractGhRepoTarget(cmdStr);
  const ghTargetNote = ghTargetRepo ? ` (target repo: '${ghTargetRepo}')` : "";
  if (GH_PR_CREATE_RE.test(cmdStr)) {
    const cleanAutogateForm = !SHELL_COMPOSITION_RE.test(cmdStr) && GH_PR_CREATE_EXACT_RE.test(cmdStr.trim());
    if (cleanAutogateForm && isPrCreateAutogateEnabled(reader)) {
      return allow(
        `outward action 'gh pr create'${ghTargetNote} auto-allowed by opt-in config autogate.pr_create=true (dev-guard.ts); the prepublish-guard tests-before-PR floor still applies independently (deny > allow); ${GATE_DOC_POINTER}`
      );
    }
    return ask(
      `outward action 'gh pr create'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate`
    );
  }
  if (GH_PR_MERGE_RE.test(cmdStr)) {
    return ask(
      `outward action 'gh pr merge'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate`
    );
  }
  if (GH_PR_REVIEW_RE.test(cmdStr)) {
    return ask(
      `outward action 'gh pr review'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate`
    );
  }
  if (GH_PR_COMMENT_RE.test(cmdStr)) {
    return ask(
      `outward action 'gh pr comment'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate`
    );
  }
  if (GH_API_REST_PR_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh api' mutating PR endpoint requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (GH_GRAPHQL_RE.test(cmdStr) && GRAPHQL_PR_MUTATIONS_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh api graphql' PR-mutating operation requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (GH_ISSUE_WRITE_RE.test(cmdStr)) {
    return ask(
      `outward action 'gh issue write'${ghTargetNote} requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate`
    );
  }
  if (CURL_WGET_MUTATING_RE.test(cmdStr)) {
    return ask(
      "outward action via curl/wget to api.github.com with mutating method requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (API_GITHUB_URL_RE.test(cmdStr) && MUTATING_METHOD_RE.test(cmdStr)) {
    return ask(
      "outward action to api.github.com with mutating method requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  return none();
}

// bodies/prepublish-guard.ts
var CONTROL_CHAR_RE = /[\x00-\x09\x0b-\x1f\x7f]/;

// entry/dev-guard.cc.ts
var GIT_EXEC_TIMEOUT_MS = 5e3;
function makeReader() {
  return {
    gitCurrentBranch(dir) {
      try {
        return (0, import_node_child_process.execFileSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          ...dir !== void 0 ? { cwd: dir } : {}
        }).trim();
      } catch {
        return null;
      }
    },
    resolveDefaultBranch(dir) {
      try {
        const out = (0, import_node_child_process.execFileSync)("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          ...dir !== void 0 ? { cwd: dir } : {}
        }).trim();
        if (!out) return null;
        const idx = out.indexOf("/");
        return idx >= 0 ? out.slice(idx + 1) : out;
      } catch {
        return null;
      }
    },
    resolveEffectivePushRemoteRef(dir) {
      try {
        const out = (0, import_node_child_process.execFileSync)(
          "git",
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{push}"],
          {
            encoding: "utf8",
            timeout: GIT_EXEC_TIMEOUT_MS,
            ...dir !== void 0 ? { cwd: dir } : {}
          }
        ).trim();
        return out || null;
      } catch {
        return null;
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
      "dev-guard: payload cwd contains control characters; skipping cd (fail-open)\n"
    );
    return;
  }
  if (!isDirectory(cwd)) {
    process.stderr.write("dev-guard: payload cwd does not exist as a directory; skipping cd (fail-open)\n");
    return;
  }
  try {
    process.chdir(cwd);
  } catch {
    process.stderr.write("dev-guard: cd into payload cwd failed; continuing with process CWD (fail-open)\n");
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
