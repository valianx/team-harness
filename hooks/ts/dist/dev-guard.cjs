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

// bodies/dev-guard.ts
function ask(reason) {
  return { decision: "ask", reason, mutations: null };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
var CLICKUP_WRITE_RE = /^mcp__.+__clickup_(update_task|create_task|create_task_comment|attach_task_file|delete_task)$/;
var GIT_PUSH_RE = /(^|[\s|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)/;
var GH_PR_CREATE_RE = /(^|[\s|;`])gh\s+pr\s+create(\s|$)/;
var GH_PR_MERGE_RE = /(^|[\s|;`])gh\s+pr\s+merge(\s|$)/;
var GH_PR_REVIEW_RE = /(^|[\s|;`])gh\s+pr\s+review(\s|$)/;
var GH_PR_COMMENT_RE = /(^|[\s|;`])gh\s+pr\s+comment(\s|$)/;
var GH_API_REST_PR_RE = /(^|[\s|;`])gh\s+api\s+.*(-X|--method)\s*(PUT|POST|PATCH|DELETE).*pulls/i;
var GH_GRAPHQL_RE = /(^|[\s|;`])gh\s+api\s+graphql/i;
var GRAPHQL_PR_MUTATIONS_RE = /(resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|addPullRequestReviewComment|addPullRequestReview|submitPullRequestReview|mergePullRequest)/;
var GH_ISSUE_WRITE_RE = /(^|[\s|;`])gh\s+issue\s+(create|edit|comment)(\s|$)/;
var CURL_WGET_MUTATING_RE = /(^|[\s|;`])(curl|wget)\s.*(-X|--request)\s*(PUT|POST|PATCH|DELETE).*api\.github\.com/i;
var API_GITHUB_URL_RE = /api\.github\.com/;
var MUTATING_METHOD_RE = /(-X|--request)\s*(PUT|POST|PATCH|DELETE)/i;
var RAW_OUTWARD_SCAN_RE = /(git\s+push|gh\s+pr\s+(create|merge|review|comment)|gh\s+issue\s+(create|edit|comment)|gh\s+api.*pulls|api\.github\.com)/;
function evaluate(input) {
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
    return ask(
      "outward action 'git push' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (GH_PR_CREATE_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr create' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (GH_PR_MERGE_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr merge' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (GH_PR_REVIEW_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr review' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
    );
  }
  if (GH_PR_COMMENT_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr comment' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
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
      "outward action 'gh issue write' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md \xA7 Outward-Action Gate"
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

// entry/dev-guard.cc.ts
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
