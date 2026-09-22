## Why

Team Harness still generates Luna 5.6 specialists and pins OpenCode Opus to 4.6.
The operator requested OpenAI generation 6 and Opus 5.5, preserving the existing
workflow and workload tiers.

## What Changes

- Generate bounded Codex roles and the generic fallback with GPT-6 Luna/max;
  keep GPT-6 Astra/xhigh for existing Opus-tier roles.
- Upgrade the exact previously managed Luna 5.6/max fallback during setup/update,
  retain Terra 5.6/medium migration and preserve other complete custom pairs.
- Refresh the OpenCode Opus release pin to claude-opus-5-5 in both converters.
  Keep Claude Code's native opus alias and document its provider/version boundary.
- Align current documentation, packaged assets and regression expectations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `codex-runtime-parity`: generation-6 defaults and migration of existing managed
  generic fallback configurations.

## Impact

Codex registry/generator/setup helper, generated agents, current model guidance,
OpenCode JS/Go release pins and their parity tests. No database or frontend changes.
OpenCode's pin refresh follows its existing tiering contract.

## Non-Goals

No model benchmarking, account entitlement changes, API client changes, host
upgrades, new model-selection framework, changes to Sonnet/Haiku pins, rewrites
of historical evidence, or forced replacement of operator model preferences.
