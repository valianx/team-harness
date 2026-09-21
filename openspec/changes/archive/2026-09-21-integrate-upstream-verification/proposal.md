## Why

TH already delegates specification tooling to OpenSpec, but it does not invoke upstream implementation verification or integrate Superpowers and TEA. Copying their workflows into TH would create maintenance forks and miss upstream updates; layering complete competing workflows would repeat work and undermine the native coordinator.

## What Changes

- Integrate installed Superpowers verification capabilities through the active host's supported discovery and invocation mechanisms, preserving upstream ownership and updates.
- Integrate installed BMAD TEA test-review, test-design and traceability capabilities as bounded specialist work, using its upstream installer and update path.
- Execute the named TEA and Superpowers capabilities as spec reaches their respective stages, sharing actual results rather than leaving them as optional suggestions; other entry points retain contextual selection.
- Require the installed OpenSpec implementation-verification workflow for every delivered OpenSpec change in spec, pipeline and related direct PR preparation. Structural validation, green tests and optional author review do not replace it.
- Share the configured local/Obsidian workspace and reuse applicable evidence across providers. Main evaluates findings and retains coordination under native permissions.
- Expose resolved versions, supported update routes and real compatibility limits without vendoring workflows, silently enabling project-wide hooks, or inventing CLI commands.
- Document each tool's purpose, selection triggers, invocation, context and results in one shared integration reference used by spec, pipeline and direct work.

## Capabilities

### New Capabilities

- `external-verification-workflows`: Upstream-owned Superpowers and TEA discovery, invocation, updates and shared-context integration across Claude Code, Codex and OpenCode.

### Modified Capabilities

- `openspec-archive-lifecycle`: Add mandatory upstream implementation verification before completion and archive, with accurate evidence reuse after relocation or corrections.
- `openspec-dependency-provisioning`: Make compatibility and upstream refresh policy cover the verification workflow as well as the CLI and generated planning/apply integrations.
- `openspec-distribution-boundary`: Cover upstream-generated flat OpenCode commands in packaging isolation checks.

## Impact

Canonical spec, validation, testing, PR-preparation and setup/update guidance; the existing OpenSpec dependency adapter; external-asset packaging boundaries; generated Claude Code/Codex/OpenCode projections; provider-resolution, update and lifecycle regression coverage. Research and execution reports remain in the shared workspace; only maintained integration code, tests and product intent enter Git.

## Non-Goals

- Installing providers globally or altering unrelated user installations as an effect of TH publication.
- Copying, rewriting or distributing upstream skills, agents, schemas or templates as TH assets.
- Replacing the general agent, imposing a second project plan, or adding permission hooks, release tokens or mandatory extra reviewer rounds.
- Adopting provider workflows beyond the named capabilities, changing unrelated native configuration, or migrating existing artifacts without a supported path.
