---
name: sync-codex-agents
description: Regenerate and verify Team Harness Codex agent TOML, project config, and complete generated roster from their canonical registry, semantic Claude roles, and Codex instruction adapters. Use after changing model or effort in any agents/*.md file, changing an installed role contract, runtime/schema/codex-agents.json, runtime/codex/instructions/*.md, or the Codex generator, and when checking whether committed .codex agent artifacts are fresh.
---

# Sync Codex Agents

Project the canonical role inputs through the repository's deterministic
generator. Never author generated TOML or the generated roster manually, and
never translate or rewrite role semantics using model judgment.

## Workflow

1. Work from the repository root. Read `runtime/codex/README.md` and inspect
   `git status --short` before generating so unrelated or untracked operator
   changes remain visible.
2. Run:

   ```bash
   node tools/codex-runtime/generate.mjs
   ```

   If it rejects an unexpected generated agent, report that path. Do not delete
   or overwrite it automatically.
3. Present the exact generated changes:

   ```bash
   git status --short -- .codex/config.toml .codex/agents .codex/README.md
   git diff -- .codex/config.toml .codex/agents .codex/README.md
   ```

   `git diff` omits untracked files. For every untracked generated file reported
   by the scoped status command, also show its complete addition with:

   ```bash
   git diff --no-index -- /dev/null <untracked-generated-file>
   ```

   Exit status 1 from `git diff --no-index` means a diff was found and is not a
   validation failure.
4. Run the authoritative focused checks:

   ```bash
   node tools/codex-runtime/generate.mjs --check
   node tools/codex-runtime/test_generate.mjs
   ```

5. Report generated paths, the exact checks and outcomes, and any mapping or
   instruction changes visible in the diff. Leave staging, commits, and edits to
   canonical role prose to the caller.

## Boundaries

- Treat `agents/*.md`, `runtime/codex/instructions/*.md`, and
  `runtime/schema/codex-agents.json` as inputs, not files this sync workflow is
  authorized to redesign.
- Treat `.codex/config.toml`, `.codex/agents/*.toml`, and `.codex/README.md` as
  generator-owned outputs.
- Do not remove extra files, resolve semantic mapping failures by guessing, run
  formatters over generated output, stage changes, or publish externally.
