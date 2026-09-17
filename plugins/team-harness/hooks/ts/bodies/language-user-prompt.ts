// hooks/ts/bodies/language-user-prompt.ts
// Canonical body — port of hooks/language-user-prompt.sh per-turn language reminder.
// Runtime-pure: imports no runtime symbol; reads only via LanguageReader interface.
//
// CONTRACT: NEVER blocks a user prompt turn. Emits additionalContext only.
// EVENT: UserPromptSubmit (per-turn reminder).
//
// Security (SEC-DR-A/B):
//   A — language must match ^[a-z]{2}$ full-string.
//   B — fixed-template emit; only validated lang + derived display-name interpolated.
//   C — no raw config bytes in output; error paths emit null (silent).
//
// NEVER imports hook-profile helper: language context remains available in
// TH_HOOK_PROFILE=minimal alongside SessionStart discovery.

import type { NormalizedInput } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// LanguagePromptReader — injected by the entry module.
// ---------------------------------------------------------------------------

export interface LanguagePromptReader {
  /** Read ~/.claude/.team-harness.json; returns null on any error. */
  readConfig(): Record<string, unknown> | null;
}

export interface LanguagePromptOutput {
  additionalContext: string | null;
}

// SEC-DR-A: full-string language validation.
const LANG_RE = /^[a-z]{2}$/;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? `the configured language (\`${code}\`)`;
}

// ---------------------------------------------------------------------------
// Public evaluate — returns LanguagePromptOutput.
// ---------------------------------------------------------------------------

export function evaluateLanguagePrompt(
  _input: NormalizedInput,
  reader: LanguagePromptReader
): LanguagePromptOutput {
  const config = reader.readConfig();
  if (config === null) return { additionalContext: null };

  const raw = typeof config["language"] === "string" ? config["language"] : "";
  if (!raw) return { additionalContext: null };

  // SEC-DR-A: full-string validation.
  if (!LANG_RE.test(raw)) return { additionalContext: null };

  const name = languageName(raw);

  // SEC-DR-B: only validated raw (lang code) and derived name interpolated.
  // Keep the reminder fixed apart from the validated language code and name.
  const additionalContext =
    `Reply in ${name} (configured default \`${raw}\`), regardless of this message's language, unless the operator set a per-session override.`;

  return { additionalContext };
}
