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
| `opus` + any allowed effort | `gpt-5.6-sol` | `xhigh` |
| `sonnet` + `high` or `xhigh` | `gpt-5.6-terra` | `high` |
| `sonnet` + `medium` | `gpt-5.6-terra` | `medium` |
| `haiku` + any allowed effort | `gpt-5.6-terra` | `low` |

Every role must match exactly one data-driven tier. The generator rejects an
unmapped or multiply mapped role, invalid role/source/output paths,
capabilities, sandbox modes, and profile values.

`tools/codex-runtime/generate.mjs` generates `.codex/config.toml`,
`.codex/agents/*.toml`, byte-identical packaged copies under
`plugins/team-harness/skills/setup/assets/agents/`, and the human-readable
`.codex/README.md`. That README
contains the Codex contributor workflow plus the complete canonical Team
Harness roster, with an explicit availability column distinguishing the
installed custom roles, the Main-hosted orchestrator posture, and roles not yet
shipped in the Codex beta. Seven additional `pipeline-*` identities reuse the
logical role adapters while leaving model and effort unset for explicit live
dispatch. These files are committed so a trusted checkout works
without a build step. Do not edit generated files directly.

The generated project config uses `gpt-5.6-terra` at `medium` as its generic
subagent fallback without overriding Main's selected model, adds `CLAUDE.md` as
an ordered project-instruction fallback when `AGENTS.md` is absent, enables both
`multi_agent` and `multi_agent_v2`, and uses
`workspace-write` with `on-request` approvals. It enables dependency network
access without shadowing the user-level writable roots reconciled by the
packaged setup/update helper. That global helper preserves operator-owned roots
and adds the standard Go, uv, npm, and Go module caches, Codex's private temp
directory, and the configured Obsidian Team Harness subtree. It also selects
Codex's `auto_review` approval reviewer, so ordinary Git metadata, push, and PR
creation escalations do not stop for a human prompt. This keeps routine builds
inside the sandbox without shared predictable `/tmp` directories or broad write
access to the user home. Codex still
protects `.git` directories in this mode, so tests that construct temporary Git
repositories require a narrowly approved command or an equivalent external CI
sandbox; the project config does not weaken that boundary.
In particular, an approved Team Harness Gate 1 does not grant filesystem
authority: `git worktree add` must use Codex's native on-request escalation for
the exact command because it writes refs and shared `.git/worktrees` metadata.
Team Harness setup neither adds `.git` to writable roots nor installs a blanket
Git command rule, because such a rule could outrank deterministic force-push
denial. `approval_policy` remains `on-request`; the automatic reviewer handles
the native on-request escalation for the exact worktree command while
`gate-guard` retains the deny floor. A reviewer timeout leaves the pipeline
technically paused and recoverable; it is not a functional failure or denial.
An additional writable root for an Obsidian Team Harness workspace changes only
that external subtree. It takes effect for newly started Codex sessions and
does not make the repository's `.git` writable; `.git` remains protected by
design in `workspace-write` mode.

The distributable package lives under `plugins/team-harness/`; the repo-scoped
catalog at `.agents/plugins/marketplace.json` exposes it to Codex. The root
`skills/` tree is the canonical capability set. Ten hand-authored Codex
contracts own lifecycle and gated-pipeline behavior; `sync-skills.mjs`
generates adapters for every other canonical skill, including its referenced
scripts and assets. The plugin therefore retains the required literal
plugin-local `skills/` path without maintaining an independent catalog.

Contributors should invoke `$sync-codex-agents` after changing any canonical
agent's model/effort, one of the installed role contracts, its Codex
adapter, or the registry. The skill runs the deterministic renderer, shows the
exact generated diff, and executes the same freshness and generator tests
required by CI; it never synthesizes role prose or TOML itself.

Manual verification:

```bash
node tools/codex-runtime/generate.mjs
git diff -- .codex/config.toml .codex/agents .codex/README.md
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
node tools/codex-runtime/sync-skills.mjs --check
node tools/codex-runtime/validate-marketplace.mjs
```
