---
name: modes
description: List the Team Harness skills available in Codex alphabetically with concise purposes and copy-ready invocations. Use when the operator asks for Team Harness help, commands, modes, capabilities, or which workflow to invoke. This discovery skill never activates a pipeline or another skill.
---

# List Team Harness modes

Respond in the operator's language. Enumerate every sibling
`../*/SKILL.md`, reading only its YAML `name` and `description`; never load a
sibling body. Sort the complete set by `name` and present one row per skill:

| Skill | Purpose |
|---|---|
| `$team-harness:<name>` | One short translation of its description. |

Do not rely only on the skills initially injected into the thread: Codex may
shorten or omit entries when a large installed catalog reaches its discovery
budget. The packaged sibling directories are the complete authority.

After the table, add one compact hint: use `/skills` or type
`$team-harness` in the Codex composer to browse and autocomplete these skills.
Do not read a sibling skill body, create pipeline state, dispatch an agent, or
perform a listed action merely because this catalog was requested. A later
explicit invocation owns activation and all of its prerequisites.
