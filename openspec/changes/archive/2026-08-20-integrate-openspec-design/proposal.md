## Why

Team Harness currently duplicates design intent in its own plan artifacts even though OpenSpec provides a maintained, schema-driven workflow for proposals, behavioral specs, technical designs, and implementation tasks. Making OpenSpec the canonical Design source removes that competing representation while preserving TH's specialist execution, deterministic gates, validation evidence, and delivery controls.

## What Changes

- Make OpenSpec the canonical source for proposal, behavioral specs, technical design, and implementation tasks inside the existing `@Team-Harness pipeline` Design phase; do not add a second entry point or lifecycle.
- Add deterministic preflight for the OpenSpec CLI and generated runtime skills, with an explicit install/update-or-abort decision when a supported dependency or integration is unavailable or incompatible.
- Use OpenSpec's generated skills, artifact graph, instructions, templates, and strict validation directly instead of reimplementing their planning behavior in TH.
- Replace semantic rewriting into a duplicate TH plan with a minimal execution overlay that references the pinned OpenSpec requirements, scenarios, and tasks and adds only TH-owned file scope, specialist routing, invariants, verification, rollback, and delivery controls.
- Require bidirectional traceability. Every OpenSpec scenario/task is mapped or explicitly excluded, every TH execution item points to pinned OpenSpec coordinates, and any split, merge, TH-only extension, exclusion, or ambiguity is operator-visible before Stage Gate 1.
- Keep OpenSpec source artifacts in the target repository and keep TH state, execution overlay, reviews, decisions, and evidence in the configured workspace, including Obsidian when selected; do not create a second editable OpenSpec copy.
- Prevent OpenSpec-generated runtime adapters from being redistributed as Team Harness-owned skills or commands by defining and testing explicit package ownership boundaries.
- Let implementer, tester, and QA consume the original pinned OpenSpec scenarios/tasks plus the TH execution overlay. OpenSpec instructions may guide work, but TH retains specialist dispatch, state, Freeze, security, both gates, and delivery authority.
- Keep `sync` and `archive` outside this initial integration until their post-acceptance/merge authority and evidence invalidation rules are explicitly designed.

## Capabilities

### New Capabilities

- `openspec-design-orchestration`: Make OpenSpec the canonical Design source and derive a minimal, bidirectionally traceable TH execution overlay while preserving TH's state machine, specialists, and Stage Gate 1.
- `openspec-dependency-provisioning`: Detect, confirm, install or update, verify, and record the compatible OpenSpec CLI and generated runtime skills needed by a pipeline run.
- `openspec-distribution-boundary`: Keep project-local OpenSpec-generated adapters available in the TH source repository without accidentally shipping them as Team Harness-owned runtime assets.

### Modified Capabilities

None.

## Impact

- Affects the pipeline Design orchestration contract, architect/implementer/tester/QA instructions, state/evidence schema, and execution-overlay validation tooling.
- Adds Node.js/OpenSpec compatibility metadata plus confirmation-gated CLI and generated-skill provisioning to pipeline preflight.
- Adds packaging ownership checks for the repository-root Claude distribution and source-release paths; existing Go installer, Codex plugin, and OpenCode positive-root packaging should remain unchanged unless tests expose a gap.
- Adds OpenSpec change artifacts under `openspec/` in consumer repositories and generated runtime adapters in their tool-native locations.
- Reduces `01-plan.md` and task shards to a TH-owned execution overlay; the original pinned OpenSpec scenarios remain the acceptance source consumed by specialists.
- Does not change pipeline activation syntax, TH state/gate authority, Freeze, security, Gate 1/Gate 3 semantics, or external publishing authorization.
