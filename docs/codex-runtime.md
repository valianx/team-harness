# Codex runtime

TH distributes a native Codex plugin from `plugins/team-harness/` using the
repository marketplace in `.agents/plugins/marketplace.json`. The tagged Git
tree is the artifact.

## Install and lifecycle

Use the native plugin manager:

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Run `$team-harness:setup` for TH preferences, specialist placement, general
agent discovery/voice and requested optional integrations. Configuration lives
under `${CODEX_HOME:-$HOME/.codex}`. Setup and update preserve native sandbox,
approvals, model defaults, feature flags and operator configuration.

Use `update` to install the current release and maintain TH-owned resources.
Use `reload` to read current skill instructions and apply available native
refreshes. Disk state alone does not establish loaded state or a restart need;
report a specific host limitation if a component cannot refresh.

Shared distributed releases update four version sites: the Claude plugin
manifest, Claude marketplace, Codex plugin manifest and Go installer version.

## Roles and workflows

The general agent remains Main. The skill catalog exposes spec, pipeline,
review-pr and create-pr alongside supporting capabilities. Read the selected
skill's current instructions.

Native custom roles are generated from the canonical registry and concise
runtime adapters. See [the generated roster](../.codex/README.md) for available
roles and defaults. Specialist reviewers remain read-only; they provide findings
and coverage limits while Main decides how to address them.

TH installs no Codex command interceptors and requires no profile digest or
session attestation to authorize a review. Use actual native role availability
and report a concrete capability gap when it occurs.

## Verify

```bash
node tools/codex-runtime/generate.mjs
node tools/codex-runtime/sync-skills.mjs
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
python3 tests/test_codex_runtime.py
bash tests/run-all.sh
```

Test installation changes with temporary config roots and fixture agents.
Preserve live user settings during verification.
