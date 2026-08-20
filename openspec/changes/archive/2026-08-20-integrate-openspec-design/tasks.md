## 1. Upstream OpenSpec Toolchain

- [x] 1.1 Add a packaged compatibility policy declaring Node.js `>=20.19.0`, OpenSpec `1.9.0`, the `@fission-ai/openspec` package identity, and supported runtime target names.
- [x] 1.2 Implement bounded discovery of Node.js, npm, the OpenSpec CLI, project initialization, generated runtime skills, and their ownership markers with distinct structured failure states.
- [x] 1.3 Implement live-confirmation-authorized installation or upgrade of the pinned OpenSpec package without `sudo`, floating versions, implicit Node installation, or secret-bearing evidence.
- [x] 1.4 Drive actual upstream `openspec init --tools <active-runtime>` and `openspec update` operations with collision preflight, before/after ownership checks, timeouts, output limits, and fixed argument arrays.
- [x] 1.5 Add adapter tests for ready, missing Node, missing npm, missing CLI, incompatible CLI, stale skills, declined provisioning, failed provisioning, path escape, symlink, unmanaged collision, oversized output, and redacted evidence.

## 2. Canonical Planning and Snapshot

- [x] 2.1 Update the Design orchestrator to invoke the installed upstream propose or update workflow for the bound OpenSpec change instead of reproducing its artifact graph, templates, or instructions.
- [x] 2.2 Implement strict OpenSpec status and validation capture using CLI-reported artifact paths and reject incomplete, invalid, out-of-root, or ambiguously bound changes.
- [x] 2.3 Define `inputs/openspec-snapshot.json` as the single snapshot record containing repository identity, change identity, tool versions, artifact inventory, stable source coordinates, raw SHA-256 hashes, and a task-intent SHA-256 that normalizes only checkbox state.
- [x] 2.4 Implement deterministic snapshot and freshness validation that blocks every pre-Gate-1 change, permits only authorized monotonic pending-to-complete task-checkbox transitions after implementation begins, records each new raw task hash, and blocks all other intent or progress drift before later specialist dispatch.
- [x] 2.5 Add snapshot tests for proposal, requirements, scenarios, design decisions, tasks, changed hashes, missing coordinates, duplicate coordinates, invented paths, and unbound change-name collisions.

## 3. Minimal Team Harness Execution Overlay

- [x] 3.1 Define the architect-owned execution-overlay schema containing only source references, repository ownership, specialist routing, technical constraints, quality-command identifiers, Freeze controls, and evidence requirements absent from OpenSpec.
- [x] 3.2 Define bidirectional traceability records from every TH execution or acceptance item to pinned OpenSpec coordinates and from every applicable OpenSpec requirement, scenario, decision, and task back to its TH realization.
- [x] 3.3 Require every mapping to be classified as `direct`, `split`, `merged`, `th-extension`, `excluded`, or `ambiguous`, with rationale and operator-visible disclosure for every non-direct transformation.
- [x] 3.4 Extend deterministic plan validation to reject duplicated normative source text, stale or dangling mappings, incomplete reverse coverage, unexplained exclusions, and all ambiguous transformations while retaining applicable `sharded-v1` execution checks.
- [x] 3.5 Add passing and blocking fixtures for each transformation type and prove that the validator checks structural completeness without claiming semantic equivalence.

## 4. Design and Specialist Contracts

- [x] 4.1 Update Main's Design flow to continuously preflight OpenSpec, obtain only genuinely required live decisions, dispatch the canonical OpenSpec planning pass, strictly validate and snapshot it, then dispatch a fresh overlay-only architect pass before the unchanged Gate 1 without requiring operator command re-entry between successful internal actions.
- [x] 4.2 Update the architect contract so canonical intent is written only through upstream OpenSpec workflows and the second pass may add operational realization but may not reinterpret or copy source intent.
- [x] 4.3 Update implementer dispatch to consume pinned OpenSpec task and design coordinates plus the TH execution shard, using upstream apply instructions without granting the OpenSpec workflow phase, state, or gate authority.
- [x] 4.4 Update tester and QA contracts to consume pinned OpenSpec requirements and scenarios directly while recording TH-owned test, Freeze, acceptance, and audit evidence.
- [x] 4.5 Preserve cleaner, security/adversary, delivery, state-machine, nonce, correction, Gate 1, Gate 3, and publication responsibilities as TH-owned controls.
- [x] 4.6 Regenerate and verify all Claude, Codex, and OpenCode runtime projections after changing canonical Main and specialist contracts.

## 5. Generated Skills and Distribution Boundary

- [x] 5.1 Detect and preserve OpenSpec-generated target markers and generation metadata without copying or modifying generated skill contents in TH-owned canonical skill roots.
- [x] 5.2 Prove generated propose and update skills are usable during Design while apply, sync, and archive availability cannot activate a TH phase, release a gate, mutate TH state, or publish work.
- [x] 5.3 Make `plugins/team-harness` a self-contained Claude-compatible package root and point the Claude marketplace entry at that curated root instead of the repository root.
- [x] 5.4 Add a shared ownership manifest and package-surface tests covering OpenSpec-generated Claude, Codex, Agents, and OpenCode integrations.
- [x] 5.5 Add installer and update regression tests proving TH packages exclude project-owned OpenSpec artifacts and preserve existing generated integrations unchanged in consumer repositories.

## 6. Obsidian and Recovery

- [x] 6.1 Keep OpenSpec proposal, specs, design, and tasks repository-local while storing TH snapshot, execution overlay, decisions, traceability, reviews, and evidence under the configured local or Obsidian workspace root.
- [x] 6.2 Add navigation metadata from Obsidian evidence to repository-relative OpenSpec coordinates and hashes without creating an editable vault copy of canonical source artifacts.
- [x] 6.3 Extend state, event, and recovery contracts with the OpenSpec change binding, preflight result, snapshot identity, current Design pass, and next recoverable action.
- [x] 6.4 Add recovery tests for interruption before provisioning, during upstream planning, after snapshot, during overlay generation, and after canonical intent changes.

## 7. Real End-to-End Validation and Documentation

- [x] 7.1 Add a temporary-repository end-to-end test that initializes OpenSpec, generates runtime skills, creates or updates proposal/specs/design/tasks through the upstream workflow, strictly validates them, snapshots them, validates a minimal overlay, and stops at the unchanged Gate 1.
- [x] 7.2 Run the same end-to-end flow with separate repository and local-workspace roots and with a separate Obsidian-vault workspace root.
- [x] 7.3 Add failure-path end-to-end fixtures for missing toolchain components, incompatible CLI, stale generated skills, declined or failed provisioning, invalid canonical artifacts, ambiguous mapping, unmanaged collision, and post-snapshot mutation.
- [x] 7.4 Document the canonical-source model, two-pass Design flow, dependency prompt, generated-skill ownership, specialist source consumption, repository-versus-Obsidian locations, recovery behavior, and delayed sync/archive boundary.
- [x] 7.5 Run generator, pipeline, plan-contract, adapter, installer, runtime, security-scan, prepublish, and strict OpenSpec suites and record bounded evidence for every requirement scenario.
- [x] 7.6 Apply required version and changelog updates and verify release artifacts contain only the declared Team Harness package surface.
