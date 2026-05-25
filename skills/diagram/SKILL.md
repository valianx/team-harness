---
name: diagram
description: Create an Excalidraw diagram for a concept or workflow.
---
name: diagram

Create an Excalidraw diagram that visually argues a concept, workflow, or architecture. Routes through the orchestrator which delegates to the excalidraw-diagram skill.

## Input

$ARGUMENTS — describe what to diagram. Examples:
- "the dev-team pipeline flow"
- "authentication flow for the login system"
- "how the orchestrator delegates to agents"
- A topic without description → the orchestrator infers what to visualize

## Flags

- `--vault [name]` — write the `.excalidraw` file to the Obsidian vault instead of workspaces. Reads `~/.claude/config/obsidian-vaults.json`; uses the named vault or `default` if no name given.
- `--folder <name>` — subfolder within the vault (only with `--vault`). Default: vault root.

## What happens

1. Parse `--vault` and `--folder` flags from `$ARGUMENTS` (strip them from the description).
2. Pass to the `orchestrator` agent:

```
Direct Mode Task: diagram
Description: {$ARGUMENTS without flags}
Output: {vault_path/folder/diagram.excalidraw if --vault, else "ask the user"}
Vault: {vault name or null}
Vault path: {resolved path from obsidian-vaults.json or null}
Folder: {folder name or null}
```

## Rules

- Always invoke the `orchestrator` agent — do NOT invoke the excalidraw-diagram skill directly
- The orchestrator will load the excalidraw-diagram skill context and generate the diagram
- The skill handles render validation (Playwright render loop) internally
- Output is a `.excalidraw` file (and optionally a PNG preview)
