---
name: learn-english
description: Toggle the english-learning correction mode. on enables corrections (independent of the configured response language) and offers an optional English-immersion switch; off disables corrections and asks whether to keep English; status reports current state. Writes ~/.claude/.team-harness.json directly.
---

This is a standalone utility skill that reads and writes `~/.claude/.team-harness.json` directly to toggle the english-learning correction mode. It does NOT route through the orchestrator (mirrors `/th:setup` and `/th:update`, which read/write config directly). Writing `.team-harness.json` is this skill's purpose, exactly as it is `/th:setup`'s — so the "`/th:update` never writes `.team-harness.json`" rule does not apply here. Changes take effect at the next SessionStart, when `hooks/session-start.sh` reads the keys.

Usage: `/th:learn-english [on|off|status]`

No argument is equivalent to `status`.

Analyze the input: $ARGUMENTS

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

---

## Output discipline — run quietly, report once

Operators run this skill routinely; the value is a clean result, not a play-by-play.

- **Do not narrate intermediate steps.** Execute the contract steps without emitting prose between tool calls — no "Now writing…", no per-command commentary, no restating what a command returned, no step-by-step headers. Work silently until the end.
- **The harness's activity indicator is the progress bar.** While the tool calls run, Claude Code shows its own running-command indicator; that is the progress signal. A skill cannot render an animated progress bar of its own, and must not simulate one with repeated text, percentage prints, or spinner characters. Rely on the harness indicator during execution and the single final report after it.
- **Emit exactly one operator-facing message: the final report**, after all steps complete. The exceptions are the `on` path, which has one interactive prompt (the immersion `[y/N]` question) before its final report, and the `off` path, which has one interactive prompt (the language keep/change question) before its final report. A halting error is reported immediately, then the flow stops.
- **The report is the product.** It must read like the output of a mature CLI tool: a titled status block with left-aligned labels and aligned values, neutral declarative voice, no emoji, no celebration, no filler. Keep it scannable in a couple of seconds.

---

## Argument parsing

Normalize `$ARGUMENTS` (trim, lowercase). Branch:

- `on` → **Enable branch**
- `off` → **Disable branch (interactive)**
- `status` OR empty → **Status branch (no write)**
- anything else → report `Unrecognized argument '<arg>'. Usage: /th:learn-english [on|off|status].` and stop. No write.

---

## Merge-write contract (used by Enable and Disable branches)

Every write uses **merge-write-whole-document**: read the full `~/.claude/.team-harness.json`, replace or add only the owned key(s), write the whole document back. Never emit a partial payload — this preserves `format_version`, `installed_version`, `updated_at`, `logs-mode`, `logs-path`, `logs-subfolder`, `files`, `clickup`, `pricing`, and every other existing key. This is identical to the contract in `skills/setup/SKILL.md` Step 3.6 and Step 5.

Resolve the config path as `~/.claude/.team-harness.json` (expand `~` to the OS home directory: `$HOME` on Unix/macOS, `$env:USERPROFILE` or `$HOME` on Windows).

---

## Malformed-config error handling

If `~/.claude/.team-harness.json` exists but cannot be parsed as JSON, do NOT attempt a write (a write would risk further corruption). Report one line plus a suggestion and stop:

```
~/.claude/.team-harness.json could not be parsed as JSON. No change was made.
Suggested: inspect the file for a syntax error, or re-run /th:setup to regenerate it.
```

If the file is simply absent: for `on`/`off`, treat as an empty document `{}` and create it on the merge-write (this is the normal first-write path); for `status`, report `english_learning false (inactive)` and `language not set`, with no write.

---

## Enable branch (`on`)

1. Read the current config (if the file is missing, treat as an empty document `{}` and create it on write).
2. If the file exists but is not valid JSON, apply the malformed-config error handling above and stop.
3. Merge-write: set `english_learning` to the JSON boolean `true`. Do NOT touch `language` in this step. All other keys preserved.
4. Emit the immersion prompt:

```text
th learn-english — enabled

  english_learning    true

Corrections are active for messages you write in English, regardless of the
configured response language.

Also set English as the response language for immersion? [y/N]
```

5. Read the operator's response:

   - `n` (or empty / Enter) → leave `language` unchanged. Emit the final report (no-immersion path).
   - `y` → merge-write `language` to the string `"en"`. Emit the final report (immersion path).

   **Final report (no-immersion path):**

   ```text
   th learn-english — enabled

     english_learning    true

   The change takes effect at the next SessionStart.
   ```

   **Final report (immersion path):**

   ```text
   th learn-english — enabled

     english_learning    true
     language            en

   The response language is now English. The change takes effect at the next
   SessionStart.
   ```

Edge case — **already on**: if `english_learning` is already `true`, still perform the (idempotent) merge-write and run the same interactive flow. Do not branch into a "no change" message — the operator asked for `on`; reporting the resulting state is correct.

---

## Disable branch (`off`, interactive)

1. Read the current config. If the file is missing, treat as an empty document `{}` and proceed.
2. If the file exists but is not valid JSON, apply the malformed-config error handling above and stop.
3. Merge-write: set `english_learning` to the JSON boolean `false` (explicit, not key-removal). Do NOT touch `language` in this step. All other keys preserved.
4. Determine the current `language` value (from the config read in step 1, before the write). Then emit the interactive prompt:

   **When `language` is currently `en`:**

   ```
   th learn-english — corrections disabled

     english_learning    false

   The response language is currently configured as English (language: en).
   Keep English, or change it?

     keep            leave language: en
     change <code>   set language to an ISO 639-1 code (e.g. change es)

   [keep / change <code>]
   ```

   **When `language` is currently absent or not `en`** (mode was never on, or was set to another language):

   ```
   th learn-english — corrections disabled

     english_learning    false

   The response language is currently <value-or-"not set">. Keep it, or change it?

     keep            leave language as is
     change <code>   set language to an ISO 639-1 code (e.g. change es)

   [keep / change <code>]
   ```

5. Read the operator's response:

   - `keep` (or empty / Enter) → leave `language` unchanged. Emit the final report (keep path).
   - `change <code>` → validate `<code>` against `^[a-z]{2}$` (two lowercase ASCII letters). On valid: merge-write `language` to `<code>`, emit the final report (change path). On invalid: report `Invalid language code '<code>'. Expected a two-letter ISO 639-1 code (e.g. es, pt, fr). language unchanged (still <current-value>).` and stop — do NOT write `language`. (`english_learning: false` was already written in step 3 and stands.)

   **Final report (keep path):**

   ```
   th learn-english — corrections disabled

     english_learning    false
     language            en (kept)

   Corrections are off. The change takes effect at the next SessionStart.
   ```

   **Final report (change path):**

   ```
   th learn-english — corrections disabled

     english_learning    false
     language            <code> (changed)

   Corrections are off and the response language is now <code>. The change takes
   effect at the next SessionStart.
   ```

Edge case — **off when the mode was never on**: if `english_learning` is absent or already `false`, still merge-write `false` (explicit, auditable) and run the same interactive flow. State the current `language` accurately in the prompt — do not assert `language: en` when that is not the on-disk value.

---

## Status branch (`status` / empty, NO write)

1. Read the current config. Perform NO write under any circumstance — not even if the file is missing.
2. Report the current `english_learning` (treating absent as `false`/OFF) and the current `language` (treating absent as `not set`).

   Map:
   - `english_learning: true` → `true (active)`
   - `english_learning: false` or absent → `false (inactive)`

   ```
   th learn-english — status

     english_learning    <true|false>   (<active|inactive>)
     language            <code|not set>

   Enable with /th:learn-english on. The correction mode is active whenever
   english_learning is true, regardless of the configured language. Changes
   take effect at the next SessionStart.
   ```

3. If the file is absent: report `english_learning false (inactive)` and `language not set`, with no write.
4. If the file exists but is not valid JSON: report `~/.claude/.team-harness.json could not be parsed as JSON. No change was made.` and stop (no write).
