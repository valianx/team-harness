## Why

Team Harness currently assigns GPT-5.6 Terra to bounded execution and review roles even though GPT-5.6 Luna at `max` reasoning is now accepted by the Codex V2 subagent runtime and offers a substantially better cost-performance profile for those workloads. A successful read-only spawn PoC removed the prior compatibility blocker, so the standard Codex projection can eliminate Terra while retaining Sol for the roles that own the most demanding architectural and validation judgments.

## What Changes

- Replace every standard Team Harness Codex projection of `gpt-5.6-terra` with `gpt-5.6-luna` and set its reasoning effort to `max`.
- Keep every existing `gpt-5.6-sol` projection and its `xhigh` effort unchanged.
- Change the generic subagent fallback from Terra/medium to Luna/max and migrate the formerly managed Terra fallback during setup/update while preserving unrelated custom choices.
- Update the default pipeline dispatch matrix so implementer, tester, cleaner, and delivery use Luna/max; keep architect, QA, and security on Sol/xhigh.
- Regenerate all committed Codex agent, plugin, setup-asset, project-config, and roster projections from the canonical registry, then update deterministic tests and current documentation.
- Record the completed Luna/max V2 spawn PoC as the compatibility prerequisite for implementation; keep repository verification deterministic and offline-capable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `codex-runtime-parity`: Define the canonical Luna/max projection, fallback migration, and pipeline dispatch matrix while recording the completed V2 compatibility evidence and preserving Sol/xhigh roles.

## Impact

- Canonical inputs: `runtime/schema/codex-agents.json`, Codex generator/setup reconciliation logic, and pipeline dispatch contracts.
- Generated outputs: project and packaged `.codex` configuration, installed agent TOMLs, setup assets, and the generated Codex roster.
- Verification: generator assertions, Codex runtime/setup tests, pipeline contract tests, and the already completed live Luna/max spawn PoC recorded in the design.
- Documentation: current model-projection, fallback, and pipeline-matrix descriptions. Historical benchmark evidence remains historical and is not rewritten.
- No public API or workflow-state schema changes are expected; the change alters runtime model selection and its managed migration behavior.
