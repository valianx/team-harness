# opencode model configuration

How model/provider selection works for the opencode runtime, and why team-harness
must **not** hardcode a provider-pinned model id in each opencode agent file.

## The problem we hit

The CC→opencode transform originally mapped each agent's Claude Code alias
(`model: opus`) to a bare provider-prefixed alias (`model: anthropic/opus`) for
opencode. That breaks in two distinct ways:

1. **Registry-invalid id.** opencode resolves models against a **models.dev
   snapshot bundled per opencode version** (`~/.cache/opencode/models.json`). It has
   no bare-alias keys — `anthropic/opus` is not a model id, so opencode rejects it.
   Even a concrete id can be rejected if the operator's bundled snapshot is older
   than the id (or accepted live but not in their snapshot). Resolving to "the
   latest" only helps if the chosen id exists in *that operator's* snapshot.
2. **Provider lock-in.** Hardcoding `anthropic/<id>` in every agent forces the
   anthropic provider and fights opencode's model selection. Operators who want a
   different provider (openai, etc.) cannot switch without editing every agent.

## How opencode actually selects the model

- The **primary model** lives in `opencode.json` (`model` / optional `small_model`),
  and the operator switches it at runtime with the model picker (`/model`).
- A per-agent `model:` in an opencode agent file is an **optional override**. If an
  agent **omits** `model:`, it **inherits the selected/primary model** — any provider.
- opencode validates any explicit id against its bundled models.dev snapshot. So the
  authoritative "what is valid" list is the operator's own
  `~/.cache/opencode/models.json`, not the live models.dev API.

Consequence: a provider-pinned per-agent `model:` is the wrong default. It is an
override to be used deliberately, not the baseline the transform should emit.

## The decision

team-harness opencode agents must **not** hardcode a provider-pinned model id as the
default. Two supported shapes:

- **(A) Omit per-agent `model:` → inherit the operator's `/model` selection.**
  Fully provider-agnostic and simplest. Trade-off: **loses per-agent tiering** — every
  agent (the `mode: primary` orchestrator and all `mode: subagent` agents) runs on the
  single selected model, so the Claude Code tiering (architect→opus, implementer→sonnet,
  init→haiku) is not expressed.
- **(B) Profiles (recommended long-term).** A named configuration that maps each tier
  to a provider/model, generated once and switchable in opencode. Preserves tiering
  **and** multi-provider choice. Reference pattern:
  [gentle-ai `docs/opencode-profiles.md`](https://github.com/Gentleman-Programming/gentle-ai/blob/main/docs/opencode-profiles.md)
  (`gentle-ai sync --profile cheap:anthropic/claude-haiku-...`, per-phase overrides,
  switch with Tab). team-harness's tiering is exactly a profile's tier→model map, so
  this is the natural fit.

## Differentiating effort / model tier per agent

The pipeline genuinely needs per-agent differentiation (a strong model for the
architect, a cheap one for `init`) — option (A) loses that. opencode has no built-in
provider-agnostic "tier" abstraction, so the differentiation must be expressed by one
of these mechanisms:

- **Profiles (the provider-agnostic answer).** Define a named map of tier →
  provider/model once; agents reference the tier, not a literal id. Switching provider
  = edit/select a different profile, not every agent. This is the only mechanism that
  keeps tiering **and** lets the operator choose the provider. It is option (B) above
  and the reason it is recommended.
- **`small_model` (coarse, two-way).** opencode supports a top-level `small_model`
  alongside `model` for lightweight operations — a strong/cheap split, but only two
  buckets, not the pipeline's full tier set, and still a per-deployment choice.
- **Per-model effort/reasoning suffixes (provider-specific, NOT agnostic).** Some
  providers expose effort via model-id variants (e.g. an Anthropic high/max thinking
  budget). These are tied to the provider, so they re-introduce lock-in if used as the
  agent default — usable only inside a profile that the operator opted into.

Conclusion: to differentiate effort/model-type per agent **without** pinning a provider,
the mechanism is **profiles** (tier→model map, switchable). A bare per-agent `model:`
can also differentiate, but only by hardcoding a provider — which is the lock-in we are
removing.

## Current state (as of this writing)

- **Local runtime fix applied:** the operator's `~/.config/opencode/agents/*.md` had
  their per-agent `model:` lines stripped (option A) so they inherit the `/model`
  selection — provider-agnostic, no anthropic lock-in.
- **The installer/transform is NOT yet provider-agnostic.** `cmd/install/transform.go`
  and `tools/harness-migrate/migrate.mjs` (the `toProviderPrefixedModel` seam) still
  emit a hardcoded `anthropic/<concrete-id>` via a static map (the v2.119.2 fix that
  resolved the registry-invalid-id half of the problem). That fix removed the
  *invalid-id* failure but **not the provider lock-in**. The transform needs the
  profiles redesign (B) — or, minimally, to emit no per-agent `model:` (A) — to fully
  honor multi-provider.

## Follow-up

The installer/transform model handling is the open item: adopt the profiles model (B)
so a fresh install/migrate produces opencode agents that (1) carry no invalid id,
(2) are not provider-locked, and (3) preserve tiering via a switchable profile.
