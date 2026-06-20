// hooks/ts/bodies/session-start.ts
// Canonical body — port of hooks/session-start.sh SessionStart loader.
// Runtime-pure call signature; filesystem access injected via SessionStartReader.
//
// Four loads (in order):
//   1. loadOrchestrator       — unconditional orchestrator disposition (SEC-DR-2)
//   2. loadLanguage           — .team-harness.json `language`
//   3. loadEnglishLearning    — .team-harness.json `english_learning` (opt-in)
//   4. loadWorkspaceMode      — .team-harness.json `logs-mode`/`logs-path`/`logs-subfolder`
//
// Security (SEC-DR-A/B/C):
//   A — each config-derived value is validated with a FULL-STRING check.
//       language must match ^[a-z]{2}$.
//       logs-path is rejected if it contains any control character.
//   B — the additionalContext is emitted via a fixed template; only validated/derived
//       tokens are interpolated; no raw config bytes flow into the output.
//   C — error/early-exit paths contribute nothing and never echo the raw value.
//
// Session start is NEVER blocked; the hook emits nothing on error.
//
// IMPORTS hook-profile: NO. SessionStart is not an observability hook.
// It is a session-initialization hook; it must not source _hook-profile.sh.
// (Enforcement: Suite 117 / AC-11 / CLAUDE.md §5 Hook enforcement floors.)

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// SessionStartReader interface — injected by the entry module.
// ---------------------------------------------------------------------------

export interface SessionStartReader {
  /** Read ~/.claude/.team-harness.json; returns null on any error. */
  readConfig(): Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Session-start output — NOT a NormalizedDecision (session-start emits
// additionalContext, not a permissionDecision). The shim for session-start
// wraps this in the correct envelope.
// ---------------------------------------------------------------------------

export interface SessionStartOutput {
  additionalContext: string | null;
  systemMessage: string | null;
}

// ---------------------------------------------------------------------------
// Language code → display name (closed lookup, mirrors session-start.sh).
// ---------------------------------------------------------------------------

function languageName(code: string): string {
  const NAMES: Record<string, string> = {
    en: "English",
    es: "Spanish",
    pt: "Portuguese",
    fr: "French",
    de: "German",
  };
  return NAMES[code] ?? `the configured language (\`${code}\`)`;
}

// SEC-DR-A: full-string language validation — exactly 2 lowercase alpha chars.
const LANG_RE = /^[a-z]{2}$/;
// SEC-DR-A: control-char guard for logs-path.
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

// ---------------------------------------------------------------------------
// Load 1 — orchestrator disposition (UNCONDITIONAL)
// Fires on every session. No marker guard — SEC-DR-2 re-founded v2.89.0.
// The CONTEXT string is asserted by tests/test_agent_structure.py — do NOT modify.
// ---------------------------------------------------------------------------

function loadOrchestrator(): string {
  return (
    "Team Harness orchestrator disposition is active for this session. This determination is FINAL at session start and SILENT - do NOT narrate the routing rationale or re-verify any marker. Silently adopt the orchestrator disposition: route development tasks (features, fixes, refactors, enhancements, hotfixes, issue work, review) through the full pipeline (architect -> implementer -> tester + qa + security -> delivery), dispatch leaf agents directly via Task, apply the fail-closed triage invariant (ANY ambiguity about whether a task needs the pipeline -> enter the pipeline or ask the operator; NEVER handle a development task inline without gates), and treat security floors as non-waivable. Do NOT read agents/orchestrator.md or any docs/ contract at session start - pre-loading them is a 20s+ wait; defer all contract loading until a development task enters the pipeline, then read only the needed sections from the plugin cache ~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) are intercepted by hooks/dev-guard.sh and require explicit operator approval; you cannot auto-approve them. Serve the operator first message: if it is already a concrete request or question, address it directly (answer simple non-development queries yourself; route development tasks through the pipeline); only if there is no actionable request, reply with one short line asking what to work on. Do NOT run unprompted git, filesystem exploration, Memory/KG, or environment statistics."
  );
}

// ---------------------------------------------------------------------------
// Load 2 — language
// ---------------------------------------------------------------------------

function loadLanguage(config: Record<string, unknown>): string | null {
  const lang = typeof config["language"] === "string" ? config["language"] : "";
  if (!lang) return null;

  // SEC-DR-A: full-string validation.
  if (!LANG_RE.test(lang)) return null;

  const name = languageName(lang);
  // SEC-DR-B: only validated $lang and $name are interpolated.
  return `Team Harness configured default language: \`${lang}\`. Respond to the operator in ${name} for this session — including ordinary conversation — regardless of the language of individual messages. An explicit per-session override (the operator requesting another language) still applies for this session only and takes precedence over this default.`;
}

// ---------------------------------------------------------------------------
// Load 3 — english-learning correction mode
// SEC-DR-A: boolean-safe parse — only exact literal "true" enables the mode.
// Language gate: fires only when lang == "en" OR lang is absent/empty.
// SEC-DR-B: fixed ASCII template — NO config bytes interpolated.
// ---------------------------------------------------------------------------

function loadEnglishLearning(config: Record<string, unknown>): string | null {
  // Boolean-safe: only exact literal true.
  const el = config["english_learning"];
  if (el !== true) return null;

  // Language gate: read the language key.
  const lang = typeof config["language"] === "string" ? config["language"] : "";
  if (lang && lang !== "en") return null; // non-en → stay dormant

  // SEC-DR-B: fixed ASCII template, NO config bytes interpolated.
  return (
    "Team Harness english-learning mode is active for this session. This mode operates with English as the response language (it is coupled to language: en). At the START of every reply, when the operator's latest message is written in English, give one brief, low-key learning signal, then continue and answer the operator's request normally in the same turn. Keep the signal unobtrusive — the operator is learning passively while working, so the signal must never dominate the reply or stall the conversation.\n\nEvery message gets a signal (kept minimal). If the operator's English message is already correct, acknowledge it with the plain-ASCII emoticon :) on its own short line — nothing more (do NOT render it as an emoji glyph; it is the literal two-character sequence). If the message contains a correctable error, show the compact correction block instead. Either way, the substantive answer follows in the same turn.\n\nWhat to correct (selective, not comprehensive). Correct treatable, rule-governed errors — verb tense, subject-verb agreement, articles, prepositions, plurals, word order — and any error that genuinely impedes comprehension. Do NOT flag stylistic choices, informal register, idiomatic phrasing, capitalization (including sentence-start and acronym case), or acceptable alternatives. If you are unsure whether something is an error, leave it and treat the message as correct (:)).\n\nCorrection format (compact, minimal-edit, labeled). Give a brief metalinguistic label for each fix (for example: \"past tense\", \"article\", \"subject-verb agreement\") — a few words per fix, no grammar lesson by default. After the labels, on the final line of the correction block, present the corrected version of the operator's message, changing ONLY what is wrong, preserving their phrasing and meaning, and preserving their original casing — minimal edits, not a fluency rewrite. No diff symbols, no color codes — chat is plain text.\n\nTurn structure (signal first, then continue). The learning signal (:) or the correction block) comes first; the substantive answer to the operator's actual request follows in the same reply. Never stall the conversation waiting for acknowledgement, and never let the signal replace the answer.\n\nExplanation only on explicit request. Do not append grammar explanations to the default turn. Provide a fuller, rule-based explanation ONLY when the operator explicitly asks (for example \"why?\", \"explain that\", \"explicá\"). When asked, keep the explanation atomic and rule-based: one edit, one reason, concise — not an extended lesson.\n\nExemptions — never \"correct\" these. Code, commands, file paths, URLs, identifiers, proper nouns, and any message NOT written in English (for example Spanish) are out of scope: do not evaluate them for English grammar, do not rewrite them, and do not emit a :) for a non-English message. If the message mixes English prose with code/paths, correct only the English prose around them.\n\nFailure modes to guard. (a) Do not over-correct — the default tendency is to rewrite correct text for fluency; resist it, especially for already-fluent messages. (b) Keep each correction local to the sentence where the error occurs. (c) Do not correct register or style as if it were a grammar error.\n\nAffective posture. Keep the signal brief, neutral, and non-punitive — the goal is to help, not to grade. This learning signal targets the operator's English only; your own prose stays under the standard neutral-register voice rules."
  );
}

// ---------------------------------------------------------------------------
// Load 4 — workspace mode
// ---------------------------------------------------------------------------

function loadWorkspaceMode(config: Record<string, unknown>): string | null {
  const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
  if (logsMode !== "obsidian") return null;

  const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
  if (!logsPath) return null;

  // SEC-DR-A: reject logs-path containing any control character.
  if (CONTROL_CHAR_RE.test(logsPath)) return null;

  const logsSub =
    typeof config["logs-subfolder"] === "string" && config["logs-subfolder"]
      ? (config["logs-subfolder"] as string)
      : "work-logs";

  // SEC-DR-B: only validated/derived tokens interpolated.
  return `Team Harness workspace mode: obsidian is configured. You, the top-level agent acting as orchestrator, MUST write pipeline workspaces to the resolved obsidian base, NOT local ./workspaces/. The base-path pattern is: ${logsPath}/${logsSub}/{repo}/{YYYY-MM-DD}_{feature}/. Compose the full path by substituting {repo} with the current repository name (basename of the working directory) and {YYYY-MM-DD}_{feature} with today's date and the feature slug — exactly as orchestrator Step 2 does. In the rare case that the orchestrator subagent is dispatched via nested handoff, it resolves the same base in its own boot Step 2 and receives it via the workspaces path: directive.`;
}

// ---------------------------------------------------------------------------
// composeSessionDirectives — pure shared composer.
// Returns the ordered directive array for a given config (or null config).
// Shared between the CC entry (evaluateSessionStart) and the opencode event
// handler (session-enforcement.opencode.ts) so the text is NEVER duplicated.
//
// Loads (in order):
//   1. orchestrator disposition — unconditional, always present.
//   2. language directive — gated on validated config["language"].
//   3. english-learning directive — gated on boolean config["english_learning"]
//      AND language en-or-absent.
//   4. workspace-mode directive — gated on config["logs-mode"] === "obsidian".
//
// Security (SEC-DR-A/B): delegates validation to the private load functions;
// no new interpolation site is introduced here. Config bytes reach the output
// ONLY via LANG_RE-validated `language` (loadLanguage) or CONTROL_CHAR_RE-
// validated `logs-path` (loadWorkspaceMode) or exact-true booleans
// (loadEnglishLearning). No raw config string is interpolated directly.
// ---------------------------------------------------------------------------

export function composeSessionDirectives(
  config: Record<string, unknown> | null
): string[] {
  const directives: string[] = [];

  // Load 1 — orchestrator (unconditional).
  directives.push(loadOrchestrator());

  // Load 2 — language.
  if (config !== null) {
    const langDirective = loadLanguage(config);
    if (langDirective !== null) directives.push(langDirective);
  }

  // Load 3 — english-learning.
  if (config !== null) {
    const elDirective = loadEnglishLearning(config);
    if (elDirective !== null) directives.push(elDirective);
  }

  // Load 4 — workspace mode.
  if (config !== null) {
    const wsDirective = loadWorkspaceMode(config);
    if (wsDirective !== null) directives.push(wsDirective);
  }

  return directives;
}

// ---------------------------------------------------------------------------
// Public evaluateSessionStart — main body function.
// Returns SessionStartOutput (additionalContext + systemMessage).
// Calls composeSessionDirectives() to keep the CC path byte-identical.
// ---------------------------------------------------------------------------

export function evaluateSessionStart(
  _input: NormalizedInput,
  reader: SessionStartReader
): SessionStartOutput {
  const config = reader.readConfig();
  const directives = composeSessionDirectives(config);

  if (directives.length === 0) {
    return { additionalContext: null, systemMessage: null };
  }

  const additionalContext = directives.join("\n\n");
  return { additionalContext, systemMessage: null };
}

// ---------------------------------------------------------------------------
// evaluate() — adapts SessionStartOutput to NormalizedDecision for the
// generic entry pattern. Session-start is a special case: the outbound shim
// emits additionalContext, not a permissionDecision. The decision field is
// used to signal "has output" (allow = has context) vs "no output" (none).
// The CC entry reads both fields from the SessionStartOutput directly.
// ---------------------------------------------------------------------------

export function evaluate(
  input: NormalizedInput,
  reader: SessionStartReader
): NormalizedDecision & { sessionOutput?: SessionStartOutput } {
  const sessionOutput = evaluateSessionStart(input, reader);
  if (sessionOutput.additionalContext === null && sessionOutput.systemMessage === null) {
    return { decision: "none", reason: "", mutations: null };
  }
  return {
    decision: "allow",
    reason: "",
    mutations: null,
    sessionOutput,
  } as NormalizedDecision & { sessionOutput?: SessionStartOutput };
}
