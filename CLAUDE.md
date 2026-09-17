# Team Harness contributor guide

Team Harness provides workflows and specialist roles for Claude Code, Codex and
OpenCode. The native general agent coordinates; TH focuses on clear objectives,
written intent, implementation, useful independent review and delivery.

## Working approach

Use `spec` for development that benefits from written intent and tasks. Use
`pipeline` when the operator chooses broader coordination, `review-pr` for
existing PR reviews and `create-pr` for author-side delivery. Read the current
skill and only the references needed for the task. Preserve native permissions
and the user's runtime settings.

Reviewers and adversaries provide findings and recommendations from limited
context. The coordinator evaluates them, verifies corrections and continues the
authorized objective. There are no TH command guards, capability leases, gate
nonces or publication release records.

Honor user and project writing preferences. Use clear, neutral language and lead
with the outcome. Repository source, maintained docs and identifiers use English.

## Source map

- `skills/`: canonical workflows and useful supporting tools.
- `agents/`: semantic roles and coordination guidance.
- `runtime/codex/instructions/` and `runtime/schema/codex-agents.json`: Codex
  role inputs; generated TOMLs live in `.codex/agents/` and the plugin.
- `plugins/team-harness/`: Codex package with canonical shared assets and
  runtime-specific skill overrides.
- `installer-assets/opencode-skills/`: OpenCode projection and installation
  overrides; `cmd/install/` contains the Go installer.
- `hooks/`: Claude discovery, language and optional observability.
- `openspec/`: product intent, living specs and canonical change history.

## Development and verification

Preserve unrelated work. Keep scratch scripts, logs and temporary evidence in
the configured workspace or temporary storage; commit reusable tools, fixtures,
tests and deliberate product documentation.

Use `rg` for searches and `apply_patch` for manual edits. After changing shared
roles, update relevant Codex adapters and run the generator. After changing
skills or shared assets, synchronize the projections.

```bash
node tools/codex-runtime/generate.mjs
node tools/codex-runtime/sync-skills.mjs
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
bash tests/run-all.sh
```

Tests should exercise executable behavior or machine-readable artifacts.
Evaluate skill and agent prose through review rather than keyword assertions.
Run checks appropriate to the changed behavior and describe meaningful limits.

## Delivery

Use a feature branch and conventional commits. Follow the PR template and use
`create-pr` to inspect scope and archive readiness. Distributed changes update
the shared version in the Claude plugin, marketplace, Codex plugin and installer.
Record release behavior in the changelog.

Archive completed, verified OpenSpec work with implementation in the same PR.
Keep incomplete or unrelated changes out of that archive. Publishing and merging
follow the user's authorization and the host's native permissions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and release details.
