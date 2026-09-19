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
| `opus` + any allowed effort | `gpt-6-astra` | `xhigh` |
| `sonnet` + `high` or `xhigh` | `gpt-5.6-luna` | `max` |
| `sonnet` + `medium` | `gpt-5.6-luna` | `max` |
| `haiku` + any allowed effort | `gpt-5.6-luna` | `max` |

The critical installed roles (`architect`, `qa`, `security`, and
`pr-review-verifier`) use Astra at `xhigh`, preserving their existing reasoning
effort. Bounded roles and the generic fallback use Luna at `max`. Main keeps
the model selected in the active chat.

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

The generated project config uses `gpt-5.6-luna` at `max` as its generic
subagent fallback without overriding Main's selected model, adds `CLAUDE.md` as
an ordered project-instruction fallback when `AGENTS.md` is absent, and enables
both `multi_agent` and `multi_agent_v2`. It deliberately omits
`sandbox_mode`, `approval_policy`, `approvals_reviewer`, `network_access`, and
`writable_roots`, leaving those execution decisions to Codex and the operator.
Setup and update preserve existing native values and never add global cache,
temporary, repository, or Obsidian roots as Team Harness defaults. Reviewer
agent projections retain their read-only sandbox class as a role capability;
that declaration does not replace the host's global policy. Workspace settings
select the Obsidian destination, while any write there remains subject to the
native permission boundary. When an access probe fails, report its exact target
and native refusal rather than prescribing a policy rewrite or restart without
activation evidence.

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
