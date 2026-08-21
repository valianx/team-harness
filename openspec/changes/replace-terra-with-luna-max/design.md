## Context

See `proposal.md` for motivation and `specs/codex-runtime-parity/spec.md` for the behavioral contract.

Codex role selection has two distinct paths. Installed named agents receive model and effort from projection tiers in `runtime/schema/codex-agents.json`, while the seven `pipeline-*` identities intentionally omit both fields and receive an explicit pair at each fresh V2 spawn. The generic subagent fallback is separately installed and reconciled by setup/update.

The former compatibility concern has been resolved before implementation: on 2026-08-21, Main spawned a fresh `gpt-5.6-luna` / `max` subagent with `fork_turns: none`; it executed `pwd` and Git read-only commands in this repository, returned `LUNA_MAX_POC_OK`, and left `main` clean at `2f24bb51`.

## Goals / Non-Goals

**Goals:**

- Make one canonical registry change drive every installed named-agent and generated-roster projection.
- Keep the spawn-overridable pipeline identities model-free while changing their standard explicit dispatch pairs.
- Migrate only known managed fallback values and preserve operator-owned custom configuration.
- Keep generation and CI deterministic and offline-capable.

**Non-Goals:**

- Change Main's selected model or reasoning effort.
- Change Sol-backed roles, live single-model override semantics, source Claude metadata, role instructions, permissions, gates, or pipeline state.
- Rewrite historical benchmark/evidence files or add a networked model invocation to routine CI.
- Claim that Luna and Terra are behaviorally identical outside the bounded Team Harness workloads covered by this decision.

## Decisions

### 1. Collapse all non-Opus projection tiers to Luna/max

The `team-harness` profile will keep the `opus` tier at `gpt-5.6-sol` / `xhigh`. The `sonnet-high`, `sonnet-medium`, and `haiku` tiers will all map to `gpt-5.6-luna` / `max`. The generic project fallback will also become Luna/max.

This implements the operator's rule directly: every current Terra selection becomes Luna/max, including projected roles not yet shipped as Codex custom agents. Keeping the existing tier names preserves source-role classification and avoids changing semantic agent metadata merely because multiple tiers now share one runtime pair.

Alternative considered: migrate only the currently installed Terra agents. Rejected because the generated roster would continue advertising Terra for unshipped roles and would reintroduce mixed behavior when those roles become available.

### 2. Preserve explicit pipeline dispatch

The `pipeline-*` TOMLs will continue to omit `model` and `model_reasoning_effort`. The standard dispatch matrix in the packaged Codex pipeline skill will change implementer, tester, cleaner, and delivery to Luna/max; architect, QA, and security stay Sol/xhigh. Every spawn continues to use `fork_turns: none` and pass both values explicitly.

Alternative considered: pin Luna/max in the `pipeline-*` TOMLs. Rejected because it would break the existing live uniform-model override and make dispatch precedence ambiguous.

### 3. Make fallback migration pair-aware

Setup/update will define Luna/max as current and treat the exact formerly managed Terra/medium pair as legacy. Missing values will still be installed. Any other complete operator-selected pair, including a non-default Terra effort, remains `custom-preserved`. The existing atomic write, backup, idempotence, and restart-required reporting remain unchanged.

The prior Luna/max value already equals the new desired pair and therefore becomes current without a rewrite. Pair-aware classification replaces model-only legacy detection so an operator's custom model/effort combination is not overwritten accidentally.

Alternative considered: classify every Terra model as legacy regardless of effort. Rejected because Team Harness cannot distinguish a managed Terra/medium fallback from an intentional Terra/high or Terra/max operator choice by model name alone.

### 4. Generate derived surfaces and test the contract offline

Implementation will change canonical inputs and generator/setup invariants, then regenerate committed project config, agent TOMLs, packaged setup assets, and the roster. Deterministic tests will assert the new pair, Sol preservation, model-free `pipeline-*` identities, exact fallback migration, custom preservation, idempotence, and absence of Terra from current standard projection surfaces.

The completed live PoC is the prerequisite evidence for runtime acceptance. Routine CI will not spawn a billable remote model; it will validate the configuration and dispatch contract offline. Historical evidence and migration fixtures may retain Terra where it describes the previous state.

Alternative considered: add a live Luna/max spawn to every CI run. Rejected because network availability, credentials, service state, nondeterminism, and cost would turn a projection regression check into a flaky external integration test.

## Risks / Trade-offs

- [Luna/max is slower than a lower reasoning effort for trivial roles] → Keep the mapping centralized so effort can be revised in one registry change if pipeline telemetry shows unacceptable latency.
- [A benchmark or minimal PoC may not expose role-specific quality regressions] → Preserve Sol/xhigh for architect, QA, and security; run the existing deterministic suites and compare real pipeline acceptance/correction behavior after rollout.
- [Broad search assertions could reject legitimate historical or migration references to Terra] → Scope absence checks to current canonical/generated projection and current documentation surfaces, with explicit allowances for historical evidence and legacy migration fixtures.
- [Setup could overwrite an intentional Terra choice] → Detect the exact managed Terra/medium pair rather than the model alone and retain custom-preserved behavior for all other complete pairs.
- [Generated copies can drift from canonical inputs] → Use the existing Codex generator/check workflow and packaged-copy parity suites before delivery.

## Migration Plan

1. Update the canonical profile and generic fallback to Luna/max, leaving Sol/xhigh unchanged.
2. Update generator invariants, setup/update fallback classification, and the standard pipeline dispatch matrix.
3. Regenerate all committed Codex projections and packaged copies.
4. Update deterministic tests and current documentation, preserving historical evidence.
5. Run the Codex generation checks and the repository suites required for shared-runtime changes.
6. On setup/update, migrate exact Terra/medium managed fallbacks atomically with backup and report that a new Codex session is required.

Rollback is the inverse canonical mapping followed by regeneration. The setup backup permits restoring an operator configuration, and a code rollback restores the previous managed-fallback reconciliation behavior.
