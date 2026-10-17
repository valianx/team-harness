## Context

See proposal.md. Pi already inherits the parent model/thinking; OpenCode defaults to inheritance with a legacy opt-in Anthropic tier map. The active chat's native model picker remains authoritative. The Pi living spec already conditions inheritance on absence of an explicit native mapping.

## Goals / Non-Goals

Add explicit specialist choices without another provider registry, credential store or model benchmark. Keep the setup diagnostics delivery separate. No database/frontend sketch applies.

## Decisions

1. **One persisted contract.** Store `worker-models: {schema_version:1, profiles:{reasoning:selection,general:selection,mechanical:selection}, role_overrides:{role:selection-or-profile}}` in each native `.team-harness.json`. A selection is `{mode:"inherit"}` or `{mode:"model",provider:"native-id",model:"native-id"}`; a role can use `{profile:"reasoning"}`. Validate modes, bounded identities, categories and role references; preserve opaque preferences. All profiles may use the same model. No API keys or cost/quality promises.
2. **Neutral role categories and parity.** Keep suggested workload assignments in one machine-readable shared setup resource, separate from host model aliases. A shared JavaScript resolver and equivalent Go consumer implement role override → category → inherit. Exclude coordinator/primary roles. Show assignments and changes before confirmation; overrides allow operator adjustments.
3. **OpenCode native catalog and pre-plan draft.** Use the selected installed CLI's `models --verbose` without `--refresh`, shell, auth or inference. Its output is a provider/model line followed by a pretty-printed JSON object, not NDJSON; parse and bound complete records, keep provider/id and capabilities only. A targeted guided setup action collects the draft before `ComputePlan`/`selectTransform`; an explicit JSON-file input supports agent-guided/noninteractive application. Validate before writes, preserve all primary model metadata and native configuration, then render only specialist choices. Merely adding a post-apply form field is insufficient. Legacy tiers remain unchanged without the new object; any offered import is an explicit preview/confirmation, never a forced rewrite.
4. **Pi native command and new-conversation binding.** Add `th-worker-models` through the existing extension, using `ctx.modelRegistry.getAvailable()` and native UI selection/confirmation. Save with `setSettings(getAgentDir(), ...)`, never the primary SettingsManager or `pi.setModel`. Resolve on each new dispatch and snapshot the choice before queueing; existing workers and session associations retain their selection. Use public `getSupportedThinkingLevels`/`clampThinkingLevel` for the selected worker model, and report unsupported resources normally.
5. **Truthful catalog limits.** Missing catalog and missing model are distinct diagnostics. Configuration uses a real catalog snapshot; subsequent explicit Pi dispatch validates its selection before launching. OpenCode retains explicit identities and reports native availability/override limits without substituting defaults. Catalog presence is metadata evidence, not authentication or an execution test.
6. **Bounded proof.** Execute actual TEA test-design before implementation; use existing Go/Node/Pi canned-provider infrastructure for precedence, preservation, cancellation, multiline catalog parsing, Go/JS parity and worker-session continuity. No live model call. Test-review, trace and actual OpenSpec implementation verification reuse the same evidence. Refresh only affected checks after scoped repairs.

OpenCode action: `install setup models --runtime opencode` collects a guided draft; `--worker-models-file PATH` accepts an explicit object. `--dry-run` and a non-TTY run without `--yes` preview without writing. `--yes` confirms a supplied file; `--non-interactive` alone does not approve it. Declared discovery limits before boundary tests: 5 seconds plus 250 ms wait delay, 16 MiB stdout, 8 KiB stderr, 8192 records, 256 KiB per JSON record and 64 KiB draft input. Use literal `opencode models --verbose` without refresh.

Documentation budget: extended — a new shared preference needs one short public reference plus native setup/Pi/OpenCode entry updates; max 160 added nonblank lines, including at most 80 lines in a necessary new shared guide. Generated copies and living specs are reviewed separately.

## Risks / Trade-offs

- Large/stale/failed catalogs → bound native probes and distinguish unavailable verification from missing identities; preserve saved choices.
- Native configuration may override generated worker metadata → preserve those choices and explain effective native precedence instead of claiming activation.
- Existing tier preferences → retain compatibility until explicit migration; never reset the primary model as a migration side effect.
- Changing profiles during work → persist only preferences; do not reset the manager or rebind existing conversations.

## Migration Plan

Add an opt-in preference and targeted configuration actions. Existing installations retain inheritance or their explicitly configured legacy tiers. After the setup delivery merges, advance this isolated branch to that main before committing implementation or coordinating its next release.
