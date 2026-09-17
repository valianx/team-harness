# Codex role projection

`runtime/schema/codex-agents.json` maps canonical role metadata in `agents/`
to native Codex TOMLs. Concise Codex instructions live under `instructions/`;
the generator does not translate semantic prose automatically.

The generator emits `.codex/agents/`, matching packaged assets and a roster.
The generated project config contains no execution, permission, feature,
concurrency or model defaults. Those remain native user settings.

Role-level model and effort defaults help choose specialists. Spawn-selected
`pipeline-*` roles inherit the runtime selection unless the operator requests
a pair. Native read-only reviewer roles remain in the registry.

Run the [sync skill](../../.agents/skills/sync-codex-agents/SKILL.md) after changing
inputs:

```bash
node tools/codex-runtime/generate.mjs
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
```

Skill adapters and bundled shared resources are synchronized separately with
`node tools/codex-runtime/sync-skills.mjs`. Codex installs no TH command hooks.
