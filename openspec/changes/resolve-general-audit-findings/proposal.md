## Why

The general TH audit reproduced workflow-helper failures and found stale paths,
disconnected instructions and obsolete installer code. The operator requested
all reported pending findings be corrected in the existing update PR.

## What Changes

- Preserve repository and snapshot identity when validating review evidence.
- Make regression evidence and relevant test fixtures work on Windows; keep probes in their owning run.
- Resolve workspace ancestors physically and route visual work through the shared workspace and active runtime.
- Keep quality execution separate from package installation and report malformed reviewer data accurately.
- Connect GCP cost analysis to the native coordinator, align security self-scan documentation/coverage, and retain OpenCode context through its supported native guide.
- Correct Windows dependency guidance and remove verified orphan code and obsolete references without removing active capabilities.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-canonical-local`: physical destination checks and direct visual invocation.
- `review-context-grounding`: inconsistent snapshot identity cannot reuse evidence.
- `native-pr-review-orchestration`: portable owned regression probes.
- `quality-runner-diagnostics`: repository identity, execution scope and malformed-result diagnostics.
- `native-workflow-entry`: coherent cost-analysis/context entry points and OS-specific setup guidance.
- `quality-diagnosis`: self-scan descriptions and role coverage match execution.

## Non-Goals

No new permission system, workflow gate, third-party tool implementation, broad
rewrite, runtime agent replacement or deletion by file count. No fixes to
unreproduced speculative findings or unrelated consumer repositories.

## Impact

Canonical skills/helpers, maintained tests, installer code and documentation;
regenerated runtime copies. The existing PR retains one 3.38.1 release bump.
This change preserves the completed quiet-update-reporting archive and adds its
own verified archive. All execution evidence stays in the existing workspace.
