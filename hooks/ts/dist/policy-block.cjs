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
    reason: `Blocked by team-harness policy: ${reason}. If you genuinely need this, run it manually outside Claude or scope an exception in hooks/config.json.`,
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
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/, "OpenAI-style secret key (sk-\u2026 pattern)"],
  [/\bAIza[0-9A-Za-z_\-]{35}\b/, "Google API key (AIza\u2026 pattern)"],
  [/\b[rs]k_live_[0-9A-Za-z]{16,}\b/, "Stripe live secret key (sk_live_/rk_live_ pattern)"],
  [/\bglpat-[0-9A-Za-z_\-]{20}\b/, "GitLab personal access token (glpat-\u2026 pattern)"],
  [/\bgh[osru]_[A-Za-z0-9]{36}\b/, "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)"],
  [/\bxoxb-[A-Za-z0-9-]{10,}\b/, "Slack bot token (xoxb-\u2026 pattern)"]
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
    for (const [pattern, label] of DENIED_BASH) {
      if (pattern.test(cmd)) return deny(label);
    }
    if (checkNoVerifyTokenized(cmd)) {
      return deny("--no-verify (bypasses pre-commit hooks)");
    }
    if (/\bgit\s+commit\b/.test(cmd)) {
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
