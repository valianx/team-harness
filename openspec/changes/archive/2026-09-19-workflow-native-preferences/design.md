## Approach

Keep TH-owned installation state distinct from native execution policy. Remove the persistent runtime-profile domain rather than adding a configurable copy of the native permission system. Setup can explain the host's controls when the operator asks, but ordinary setup/update must not write sandbox, approval, network or writable-root preferences. Existing settings remain untouched, including formerly managed values; deletion is not an ownership migration.

Retain agent definitions and native registration, feature prerequisites and MCP inspection. Reviewer read-only role defaults are role capabilities, not a replacement global policy. Workspace selection remains in TH settings and the existing workspace resolver. A real access failure is reported with its exact target and native permission boundary; it does not cause update to rewrite global settings or prescribe a restart.

Consolidate prose where a maintained helper or shared contract already owns the procedure. Skills retain purpose, inputs, outcomes, invocation and useful references. Main owns reviewer dispositions and uses scope-appropriate evidence. No new wrappers, result registries, control logs or prose-matching tests are introduced.

## Existing intent

`codex-update-convergence` currently requires persistent runtime classification and a follow-up approval; this change replaces those requirements with preference preservation. `codex-runtime-parity` still requests drift repair and restart advice, which conflicts with the newer native-policy and reload intent; its affected requirements are reconciled here.

The active `runtime-reload` change has separate activation and transport requirements that remain valid. `report-setup-write-outcomes` concerns truthful reporting at existing setup sites, including other runtimes; preserve it and its non-Codex consumers. Neither proposal is archived merely because its tasks are checked. Other active changes remain outside this scope.

The Verify/spec edits consolidate pointers only. They preserve the authored behavior in `spec-sequential-review`, `prove-direct-fix-evidence`, `spec-operator-plan` and `pr-regression-evidence`: one immutable full review, original results, evidence-backed coordinator closure, optional direct fix evidence and the existing operator plan. Shared return edits preserve the result envelope and lease protocol, including the active `reconcile-specialist-read-contracts` work. No deltas to those capabilities are needed for reference consolidation.

## Validation

Use temporary HOME/CODEX_HOME fixtures and mock native commands for updater behavior. Assert preserved native values and unrelated configuration, successful repeated convergence without a runtime approval, complete role installation and bounded partial recovery. Reuse workspace, generator, installer and skill synchronization suites. Manually inspect instruction semantics; tests must not require particular prose. Keep transient evidence in the configured Obsidian workspace and include only canonical completed OpenSpec history in the PR.
