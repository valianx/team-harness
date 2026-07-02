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

// entry/session-start.cc.ts
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

// bodies/session-start.ts
function languageName(code) {
  const NAMES = {
    en: "English",
    es: "Spanish",
    pt: "Portuguese",
    fr: "French",
    de: "German"
  };
  return NAMES[code] ?? `the configured language (\`${code}\`)`;
}
var LANG_RE = /^[a-z]{2}$/;
var CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
function loadOrchestrator() {
  return "Team Harness orchestrator disposition is active for this session. This determination is FINAL at session start and SILENT - do NOT narrate the routing rationale or re-verify any marker. Silently adopt the orchestrator disposition: route development tasks (features, fixes, refactors, enhancements, hotfixes, issue work, review) through the full pipeline (architect -> implementer -> tester + qa + security -> delivery), dispatch leaf agents directly via Task, apply the fail-closed triage invariant (ANY ambiguity about whether a task needs the pipeline -> enter the pipeline or ask the operator; NEVER handle a development task inline without gates), and treat security floors as non-waivable. Do NOT read agents/orchestrator.md or any docs/ contract at session start - pre-loading them is a 20s+ wait; defer all contract loading until a development task enters the pipeline, then read only the needed sections from the plugin cache ~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) are intercepted by hooks/dev-guard.sh and require explicit operator approval; you cannot auto-approve them. Serve the operator first message: if it is already a concrete request or question, address it directly (answer simple non-development queries yourself; route development tasks through the pipeline); only if there is no actionable request, reply with one short line asking what to work on. Do NOT run unprompted git, filesystem exploration, Memory/KG, or environment statistics.";
}
function loadLanguage(config) {
  const lang = typeof config["language"] === "string" ? config["language"] : "";
  if (!lang) return null;
  if (!LANG_RE.test(lang)) return null;
  const name = languageName(lang);
  return `Team Harness configured default language: \`${lang}\`. Respond to the operator in ${name} for this session \u2014 including ordinary conversation \u2014 regardless of the language of individual messages. An explicit per-session override (the operator requesting another language) still applies for this session only and takes precedence over this default.`;
}
function loadEnglishLearning(config) {
  const el = config["english_learning"];
  if (el !== true) return null;
  const lang = typeof config["language"] === "string" ? config["language"] : "";
  if (lang && lang !== "en") return null;
  return `Team Harness english-learning mode is active for this session. This mode operates with English as the response language (it is coupled to language: en). At the START of every reply, when the operator's latest message is written in English, give one brief, low-key learning signal, then continue and answer the operator's request normally in the same turn. Keep the signal unobtrusive \u2014 the operator is learning passively while working, so the signal must never dominate the reply or stall the conversation.

Every message gets a signal (kept minimal). If the operator's English message is already correct, acknowledge it with the plain-ASCII emoticon :) on its own short line \u2014 nothing more (do NOT render it as an emoji glyph; it is the literal two-character sequence). If the message contains a correctable error, show the compact correction block instead. Either way, the substantive answer follows in the same turn.

What to correct (selective, not comprehensive). Correct treatable, rule-governed errors \u2014 verb tense, subject-verb agreement, articles, prepositions, plurals, word order \u2014 and any error that genuinely impedes comprehension. Do NOT flag stylistic choices, informal register, idiomatic phrasing, capitalization (including sentence-start and acronym case), or acceptable alternatives. If you are unsure whether something is an error, leave it and treat the message as correct (:)).

Correction format (compact, minimal-edit, labeled). Give a brief metalinguistic label for each fix (for example: "past tense", "article", "subject-verb agreement") \u2014 a few words per fix, no grammar lesson by default. After the labels, on the final line of the correction block, present the corrected version of the operator's message, changing ONLY what is wrong, preserving their phrasing and meaning, and preserving their original casing \u2014 minimal edits, not a fluency rewrite. No diff symbols, no color codes \u2014 chat is plain text.

Turn structure (signal first, then continue). The learning signal (:) or the correction block) comes first; the substantive answer to the operator's actual request follows in the same reply. Never stall the conversation waiting for acknowledgement, and never let the signal replace the answer.

Explanation only on explicit request. Do not append grammar explanations to the default turn. Provide a fuller, rule-based explanation ONLY when the operator explicitly asks (for example "why?", "explain that", "explic\xE1"). When asked, keep the explanation atomic and rule-based: one edit, one reason, concise \u2014 not an extended lesson.

Exemptions \u2014 never "correct" these. Code, commands, file paths, URLs, identifiers, proper nouns, and any message NOT written in English (for example Spanish) are out of scope: do not evaluate them for English grammar, do not rewrite them, and do not emit a :) for a non-English message. If the message mixes English prose with code/paths, correct only the English prose around them.

Failure modes to guard. (a) Do not over-correct \u2014 the default tendency is to rewrite correct text for fluency; resist it, especially for already-fluent messages. (b) Keep each correction local to the sentence where the error occurs. (c) Do not correct register or style as if it were a grammar error.

Affective posture. Keep the signal brief, neutral, and non-punitive \u2014 the goal is to help, not to grade. This learning signal targets the operator's English only; your own prose stays under the standard neutral-register voice rules.`;
}
function loadWorkspaceMode(config) {
  const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
  if (logsMode !== "obsidian") return null;
  const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
  if (!logsPath) return null;
  if (CONTROL_CHAR_RE.test(logsPath)) return null;
  const logsSub = typeof config["logs-subfolder"] === "string" && config["logs-subfolder"] ? config["logs-subfolder"] : "work-logs";
  return `Team Harness workspace mode: obsidian is configured. You, the top-level agent acting as orchestrator, MUST write pipeline workspaces to the resolved obsidian base, NOT local ./workspaces/. The base-path pattern is: ${logsPath}/${logsSub}/{repo}/{YYYY-MM-DD}_{feature}/. Compose the full path by substituting {repo} with the current repository name (basename of the working directory) and {YYYY-MM-DD}_{feature} with today's date and the feature slug \u2014 exactly as orchestrator Step 2 does. In the rare case that the orchestrator subagent is dispatched via nested handoff, it resolves the same base in its own boot Step 2 and receives it via the workspaces path: directive.`;
}
function composeSessionDirectives(config) {
  const directives = [];
  directives.push(loadOrchestrator());
  if (config !== null) {
    const langDirective = loadLanguage(config);
    if (langDirective !== null) directives.push(langDirective);
  }
  if (config !== null) {
    const elDirective = loadEnglishLearning(config);
    if (elDirective !== null) directives.push(elDirective);
  }
  if (config !== null) {
    const wsDirective = loadWorkspaceMode(config);
    if (wsDirective !== null) directives.push(wsDirective);
  }
  return directives;
}
function evaluateSessionStart(_input, reader) {
  const config = reader.readConfig();
  const directives = composeSessionDirectives(config);
  if (directives.length === 0) {
    return { additionalContext: null, systemMessage: null };
  }
  const additionalContext = directives.join("\n\n");
  return { additionalContext, systemMessage: null };
}

// entry/session-start.cc.ts
function makeReader() {
  return {
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
async function main() {
  const raw = await readStdin();
  const reader = makeReader();
  try {
    const normalized = inboundCC(raw);
    const output = evaluateSessionStart(normalized, reader);
    if (output.additionalContext !== null) {
      process.stdout.write(
        JSON.stringify({ additionalContext: output.additionalContext }) + "\n"
      );
    }
  } catch (err) {
    if (err instanceof ShimRejectError) {
    }
  }
}
main().catch(() => {
  process.exit(0);
});
