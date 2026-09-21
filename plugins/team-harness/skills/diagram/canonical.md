
Create an Excalidraw diagram that visually argues a concept, workflow, or architecture. Routes through the orchestrator which delegates to the excalidraw-diagram skill.

## Input

$ARGUMENTS — describe what to diagram. Examples:
- "the dev-team pipeline flow"
- "authentication flow for the login system"
- "how the orchestrator delegates to agents"
- A topic without description → the orchestrator infers what to visualize

## Flags

- `--vault [name]` — write the `.excalidraw` file to the named Obsidian vault
  instead of the selected workspace. The active runtime resolves the vault
  mapping; the skill does not assume a host-specific config path.
- `--folder <name>` — subfolder within the vault (only with `--vault`). Default: vault root.

## What happens

1. Parse `--vault` and `--folder` flags from `$ARGUMENTS` (strip them from the description).
2. Pass to the `orchestrator` agent:

```
Direct Mode Task: diagram
Description: {$ARGUMENTS without flags}
Workspace: {absolute workspace path supplied by the caller}
Output: {explicit absolute destination; workspace/diagram.excalidraw by default}
Vault: {vault name or null}
Vault path: {resolved path from the active runtime or null}
Folder: {folder name or null}
```

## Rules

- Always invoke the `orchestrator` agent — do NOT invoke the excalidraw-diagram skill directly
- The orchestrator will load the excalidraw-diagram skill context and generate the diagram
- The skill handles render validation (Playwright render loop) internally
- Output is a `.excalidraw` file (and optionally a PNG preview)
