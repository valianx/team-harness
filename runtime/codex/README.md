# Codex runtime adapter

`runtime/schema/codex-agents.json` is the canonical registry for the initial
Codex role projection. It points to two different sources deliberately:

- `agents/{role}.md` is the semantic Team Harness role. The generator reads its
  `name`, `model`, and `effort` frontmatter to select exactly one projection
  tier.
- `runtime/codex/instructions/{role}.md` is the concise Codex runtime adapter.
  It preserves the beta's operational boundaries and links back to the semantic
  role, but it is not represented as a lossless generated copy of the larger
  Claude prompt.

The default `team-harness` profile resolves canonical source metadata as
follows:

| Canonical source | Codex model | Codex effort |
|---|---|---|
| `opus` + `xhigh` | `gpt-5.6-sol` | `xhigh` |
| `opus` + any other allowed effort | `gpt-5.6-sol` | `xhigh` |
| any allowed non-`opus` model | `gpt-5.6-luna` | `max` |

Every role must match exactly one data-driven tier. The generator rejects an
unmapped or multiply mapped role, invalid role/source/output paths,
capabilities, sandbox modes, and profile values.

`tools/codex-runtime/generate.mjs` generates `.codex/config.toml`,
`.codex/agents/*.toml`, and the human-readable `.codex/README.md`. That README
contains the Codex contributor workflow plus the complete canonical Team
Harness roster, with an explicit availability column distinguishing the six
installed custom agents, the Main-hosted orchestrator posture, and roles not yet
shipped in the Codex beta. These files are committed so a trusted checkout works
without a build step. Do not edit generated files directly.

The generated project config uses `workspace-write` with `on-request`
approvals, enables dependency network access, and redirects Go, uv, and npm
caches to dedicated `/tmp/team-harness-*` paths. This keeps routine builds
inside the sandbox without granting write access to the user home. Codex still
protects `.git` directories in this mode, so tests that construct temporary Git
repositories require a narrowly approved command or an equivalent external CI
sandbox; the project config does not weaken that boundary.

The distributable package lives under `plugins/team-harness/`; the repo-scoped
catalog at `.agents/plugins/marketplace.json` exposes it to Codex. It is
isolated from the root Claude-oriented skill set because Codex plugin
validation requires the literal plugin-local `skills/` path.

Contributors should invoke `$sync-codex-agents` after changing any canonical
agent's model/effort, one of the six installed role contracts, its Codex
adapter, or the registry. The skill runs the deterministic renderer, shows the
exact generated diff, and executes the same freshness and generator tests
required by CI; it never synthesizes role prose or TOML itself.

Manual verification:

```bash
node tools/codex-runtime/generate.mjs
git diff -- .codex/config.toml .codex/agents .codex/README.md
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
node tools/codex-runtime/validate-marketplace.mjs
```
