# Contributing

Contributions can use any coding tool. TH itself and the retired developer-mode
style are not prerequisites.

Use a feature branch, make a focused change, and open a PR against `main`.
Outside contributors use a fork; collaborators can use a branch in this
repository. Prefer conventional commits and the existing PR template. Preserve
unrelated work and keep temporary evidence out of product files.

## Cross-runtime development

| Source | Integration |
| --- | --- |
| `agents/*.md` | Update relevant Codex instruction adapters when semantics change |
| `runtime/schema/codex-agents.json` and `runtime/codex/instructions/` | Generate native role TOMLs and roster |
| `skills/` | Sync canonical skill projections and shared assets |
| Runtime-specific setup/update/reload overrides | Verify the actual affected native integration |
| Claude hooks | Build tracked observational bundles; Codex/OpenCode have no TH command hooks |
| `cmd/install/` | Run Go installer tests with fixture config roots |

The current general agent coordinates. Use bounded specialist work and
independent review where useful. TH workflows do not add an execution
authorization protocol over the runtime.

## Verification

```bash
node tools/codex-runtime/generate.mjs
node tools/codex-runtime/sync-skills.mjs
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
bash tests/run-all.sh
```

Run meaningful checks for changed behavior. Tests use temporary installations,
not live user configuration. Review agent/skill prose for coherence instead of
adding wording assertions. See [testing](docs/testing.md).

## Delivery and release

Use `create-pr` for candidate preparation and publication. Check the full diff,
durable-file scope and relevant OpenSpec archive readiness. Include completed,
verified archive with implementation in the same PR.

Distributed changes update the shared version in
`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`,
`plugins/team-harness/.codex-plugin/plugin.json` and `cmd/install/main.go`.
Record the release's behavior in the changelog; a fragment under `changelog.d/`
can be assembled at release.

After merge, a separately authorized release tags the version and pushes the tag.
The release workflow builds installer binaries; Pages publishes bootstrap
scripts. A PR or merge request alone does not ask for a release.

## Community

Use [GitHub issues](https://github.com/valianx/team-harness/issues/new/choose)
for bugs and feature requests. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report security vulnerabilities privately through [SECURITY.md](SECURITY.md).
