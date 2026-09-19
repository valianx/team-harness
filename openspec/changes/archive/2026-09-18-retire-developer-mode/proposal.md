## Why

Team Harness still ships a developer-mode output style that replaces Claude's native coding instructions, while session startup independently imposes an orchestrator identity. Useful workflow guidance should remain available without replacing the general agent.

## What Changes

- Retire the developer-mode style and its setup/update copy steps.
- Replace unconditional role adoption with discovery of spec, pipeline, review-pr and create-pr, loading the selected current skill when needed.
- Preserve coordination, voice, language, English learning, workspace/Obsidian and existing workflow methods.
- Document conservative migration of existing selections and installed styles, preserving customized files and unrelated settings.
- Keep current execution controls and their useful documentation for separate evaluation.

## Capabilities

### New Capabilities

- `native-workflow-entry`: Discover Team Harness workflows from the native general agent without a replacement output style or forced startup role.

## Impact

Claude session context, the managed general-agent guide, setup/update instructions, developer-mode documentation, related tests and generated distributions. Codex/OpenCode retain their native installation paths; the shared session composer remains consistent for the existing OpenCode source adapter without activating its disconnected hook layer.

## Non-Goals

Removing execution guards, rewriting workflow methods or specialist roles, deleting workspace/Obsidian support, changing native permissions, cleaning unrelated legacy code, or merging the previous broad PR.
