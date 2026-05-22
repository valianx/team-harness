Analyze the input: $ARGUMENTS

---

## Mode 1 — Full translation (default)

Examples: `/translate`, `/translate src/`, `/translate src/components/`

1. Parse the input:
   - If no arguments: full project translation (discover all strings, build glossary, set up i18n, translate, replace)
   - If path argument: scoped translation of the specified directory only
   - Detect source language from existing strings (default: Spanish)
   - Target language: English neutral (always)

2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: translate
   - Submode: full
   - Scope: {path specified by user, or "full project"}
   - Source language: es
   - Target language: en
   - Feature: translation
   ```

## Mode 2 — Glossary only

Examples: `/translate glossary`, `/translate glossary-only`

1. Build the glossary without modifying any code. Useful for reviewing terms before committing to translations.

2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: translate
   - Submode: glossary-only
   - Scope: full project
   - Source language: es
   - Target language: en
   - Feature: translation
   ```

## Mode 3 — Translate only (existing i18n)

Examples: `/translate apply`, `/translate translate-only`

1. Apply translations using an existing glossary. Assumes i18n infrastructure is already set up. Useful for incremental translation after new strings are added.

2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: translate
   - Submode: translate-only
   - Scope: full project
   - Source language: es
   - Target language: en
   - Feature: translation
   ```

## Mode 4 — No input provided

1. Default to full project translation.
2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: translate
   - Submode: full
   - Scope: full project
   - Source language: es
   - Target language: en
   - Feature: translation
   ```

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke the `translator` agent directly
- The th-orchestrator will route to the `translator` agent
- Output: `session-docs/{feature-name}/00-translation.md`
- Glossary is saved to `docs/glossary.md` in the project root
- The translator agent modifies source code (replaces hardcoded strings with i18n keys)
- Source language strings are preserved as-is in the source locale file (validated)
- Target language (English neutral) becomes the default locale
