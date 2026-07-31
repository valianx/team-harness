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

// bodies/policy-block.ts
function deny(reason) {
  return {
    decision: "deny",
    reason: `Blocked by team-harness safety policy: ${reason}.`,
    mutations: null
  };
}
function none() {
  return { decision: "none", reason: "", mutations: null };
}
var HIGH_CONFIDENCE_SECRETS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "GitHub personal access token"],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "GitHub fine-grained personal access token"],
  [/-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----/, "private key"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, "Anthropic API key"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/, "OpenAI-style secret key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\b[rs]k_live_[0-9A-Za-z]{16,}\b/, "Stripe live secret key"],
  [/\bglpat-[0-9A-Za-z_-]{20}\b/, "GitLab personal access token"],
  [/\bgh[osru]_[A-Za-z0-9]{36}\b/, "GitHub OAuth/server/refresh/user token"],
  [/\bxoxb-[A-Za-z0-9-]{10,}\b/, "Slack bot token"],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, "SendGrid API key"],
  [/\bAC[0-9a-f]{32}\b/, "Twilio account SID"],
  [/\bSK[0-9a-f]{32}\b/, "Twilio API key SID"]
];
function scanForHighConfidenceSecret(content) {
  for (const [pattern, label] of HIGH_CONFIDENCE_SECRETS) {
    if (pattern.test(content)) {
      return deny(`${label} detected in tool input`);
    }
  }
  return null;
}
var CATASTROPHIC_DELETE_PATTERNS = [
  /^\s*rm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?(?:\/|~|\$\{?HOME\}?)(?:\s|$)/i,
  /^\s*rm\s+\S*[fF]\S*[rR]\S*\s+(?:--\s+)?(?:\/|~|\$\{?HOME\}?)(?:\s|$)/i,
  /^\s*rm\s+-r\b.*\s+-f\b.*\s+(?:--\s+)?(?:\/|~|\$\{?HOME\}?)(?:\s|$)/i,
  /^\s*rm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?\*(?:\s|$)/i
];
function bashCarriesInlineContent(command) {
  const curlData = /\bcurl\b.*(?:--data(?:-[a-z]+)?\b|\s-d\b|--json\b|\s-F\b|--form\b)/i.test(command);
  const curlAuth = /\bcurl\b.*(?:-H|--header)\s+['"]?Authorization:\s*Bearer\b/i.test(command);
  return /\bgit\s+commit\b/i.test(command) || curlData || curlAuth || /\bwget\b.*--post-(?:data|file)\b/i.test(command) || /\btee\b/i.test(command) || /\bexport\s+\w+\s*=/i.test(command) || /\benv\s+\w+=/i.test(command);
}
function writeContent(input) {
  const toolName = input.tool?.name ?? "";
  const toolInput = input.tool?.input ?? {};
  const field = toolName === "Write" ? "content" : toolName === "Edit" ? "new_string" : "new_source";
  return typeof toolInput[field] === "string" ? toolInput[field] : "";
}
function evaluate(input) {
  const toolName = input.tool?.name ?? "";
  const toolInput = input.tool?.input ?? {};
  if (toolName === "Bash") {
    const command = typeof toolInput["command"] === "string" ? toolInput["command"] : "";
    if (!command) return none();
    if (CATASTROPHIC_DELETE_PATTERNS.some((pattern) => pattern.test(command))) {
      return deny("recursive deletion targets '/', HOME, '~', or a bare wildcard");
    }
    if (bashCarriesInlineContent(command)) {
      return scanForHighConfidenceSecret(command) ?? none();
    }
    return none();
  }
  if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    const content = writeContent(input);
    return content ? scanForHighConfidenceSecret(content) ?? none() : none();
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
    if (err instanceof ShimRejectError && process.env.TEAM_HARNESS_CODEX_HOOK === "1") {
      const fallback = {
        decision: "deny",
        reason: "policy-block: payload failed shim validation \u2014 execution denied because safety could not be evaluated (policy-block.cc.ts SEC-07).",
        mutations: null
      };
      outboundCC(fallback);
    } else if (err instanceof ShimRejectError && isParseFailure(err)) {
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
