Generate an architecture diagram using the LikeC4 DSL (architecture-as-code). Routes through the th-orchestrator which delegates to the architect for codebase analysis, then generates a `.c4` file with views. Output is a human-readable, version-controllable `.c4` source file.

## Input

$ARGUMENTS — describe what to diagram. Examples:
- "the authentication system"
- "the full platform microservices"
- "order processing flow"
- A topic without description → the th-orchestrator infers what to visualize from the codebase

## Flags

- `--vault [name]` — write the `.c4` file to the Obsidian vault instead of session-docs. Reads `~/.claude/config/obsidian-vaults.json`; uses the named vault or `default` if no name given.
- `--folder <name>` — subfolder within the vault (only with `--vault`). Default: vault root.

## What happens

1. Parse `--vault` and `--folder` flags from `$ARGUMENTS` (strip them from the description).
2. Pass to the `th-orchestrator` agent:

```
Direct Mode Task: likec4-diagram
Description: {$ARGUMENTS without flags}
Skill path: .claude/skills/likec4-diagram/
Output: {vault_path/folder/diagram.c4 if --vault, else session-docs/{feature}/diagram.c4}
Vault: {vault name or null}
Vault path: {resolved path from obsidian-vaults.json or null}
Folder: {folder name or null}
```

## Rules

- Always invoke the `th-orchestrator` agent — do NOT generate the diagram directly
- The th-orchestrator invokes the architect to analyze the codebase, then generates the `.c4` file following the skill methodology
- Validation is done via `npx likec4 validate` (CLI-based, no renderer needed)
- Output is a `.c4` file (LikeC4 DSL source) — human-readable and version-controllable
- PNG export is optional: `npx likec4 export png` if the CLI is available
