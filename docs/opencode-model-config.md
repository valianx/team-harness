# opencode model configuration

How team-harness assigns models to opencode agents: per-agent cost tiering without
provider lock-in, kept current automatically. This supersedes the earlier drafts in
this file's history (the "profiles-first" and "inherit-everywhere" framings were both
incomplete).

## opencode rules we must obey (empirically confirmed)

1. **An agent's `model:` is a static literal** in the form `provider/model-id`
   (e.g. `anthropic/claude-haiku-4-5`). There is **no runtime variable/placeholder** —
   you cannot write `model: {tier}` and have opencode resolve it.
2. **opencode validates ids against its bundled models.dev snapshot**
   (`~/.cache/opencode/models.json`, versioned per opencode release). An id absent from
   that snapshot is rejected — being "latest" on the live API is not enough.
3. **The primary agent (orchestrator) must NOT set `model:`.** opencode (verified on
   1.17.9) rejects a model on a `mode: primary` agent — this was the original
   `"anthropic/opus no es válido para el orquestador"` failure. A primary agent
   **inherits the globally-selected model** (the operator's `/model` pick). Subagents
   **may** set `model:` — that is where per-agent tiering lives.
4. The model is a **runtime selection** (`/model`) over **75+ providers** sourced from
   models.dev. Provider auth is per-provider (`opencode auth`, OAuth, or env).

## The tier model

th uses three tier labels — `default` / `medium` / `low` — mapping from the Claude Code
tiers: `opus → default`, `sonnet → medium`, `haiku → low`.

- **Primary (orchestrator):** no `model:` → runs on the operator's selected model.
- **Subagents:** tagged by tier → resolved to a concrete `provider/<id>` baked into the
  agent file. This gives per-agent cost differentiation (e.g. `init` on `low`, the
  architect on `default`).

## Variability is at GENERATION time, not runtime

Because the file needs a static literal, the "variable model" is achieved by
**regenerating the files**, not by a placeholder:

```
th source (tier label)  ──resolver (install / /th:update-models)──▶  concrete literal in the opencode agent file
   opus/sonnet/haiku            reads curated map + models.dev              model: anthropic/claude-haiku-4-5
```

Re-running the resolver **rewrites the literal** — this is how a version bump
("haiku subió de versión") or a provider switch takes effect. The file is always
concrete; the variability is the generator. `/th:update-models` and the installer
transform ARE this step.

## The resolver = curated family→tier map + models.dev version resolution

Two layers — stable curation, automated versioning:

1. **Curated family→tier map (checked into the repo).** Per provider, each tier label →
   a model **family/base name** (not a pinned version). Ragged — only the tiers that
   actually exist in the provider's current generation:
   - anthropic: `default → claude-opus`, `medium → claude-sonnet`, `low → claude-haiku`
   - google: `default → <latest-gen>-pro`, `medium → <latest-gen>-flash`, `low → <latest-gen>-flash-lite`
   - openai: `default → gpt-5.x`, `medium → *-mini`, `low → *-nano`
   - … (the family→tier judgment is human-curated; it rarely changes)
2. **models.dev API resolution.** For each `(provider, family)`, pick the **newest
   concrete version by `release_date`** → e.g. `claude-haiku` → `claude-haiku-4-5` today,
   automatically `claude-haiku-4-6` when it ships. This layer is generic and always
   fresh, and because the source is models.dev (opencode's own catalog) the ids are
   guaranteed valid for opencode.

This split is deliberate: the **judgment** (which family is which tier) is curated once;
only the **version** is automated. It avoids both hand-typed staleness (the
`4-6`-vs-`4-8` bug) and a fuzzy fully-automatic cost-ranking.

## Ragged tiers + fallback

- A provider exposes **1, 2, or 3** current-gen tiers. **Never backfill a missing tier
  with a previous-generation model** — an older model is sometimes *more* expensive, so
  it defeats `low`.
- **Missing tier → nearest available, cheaper-first** (a missing `medium` prefers the
  cheaper neighbor); a `default`-tier agent never drops below the provider's top current
  model.
- **Worst case: only one model exists → every agent uses it** ("1 modelo haciendo
  todo"). The primary inherits it via the UI anyway, so the harness still runs.

## How the orchestrator routes

The primary orchestrator (no `model:`, on the selected model) dispatches subagents via
opencode's `task` tool, gated by `permission.task`. **Each subagent runs on its own
baked tier-model**, independent of the orchestrator's model — so tiering is preserved
through routing:

```
orchestrator (primary, operator's /model pick)
   ├─ task(architect)   → architect on its model   (default)
   ├─ task(implementer) → implementer on its model  (medium)
   └─ task(init)        → init on its model         (low)
```

## Profiles — optional, only for live multi-provider

- **One provider at a time (default, and the common case):** generate **one** agent set
  for the chosen provider; re-run the resolver to switch provider. **No profiles
  needed.**
- **Several providers live at once (Tab between them):** generate one **suffixed agent
  set per provider** — `orchestrator` + `orchestrator-openai` + `orchestrator-gemini`,
  each with its own subagents. Each profile's orchestrator scopes `permission.task` to
  its own `*-<suffix>` subagents, so a profile only routes within itself; Tab selects the
  active profile/provider. This is the gentle-ai pattern; it is an opt-in power feature,
  not the baseline.

## Current state and the installer follow-up

- The CC→opencode transform (`cmd/install/transform.go`, `tools/harness-migrate/migrate.mjs`)
  currently emits a hardcoded `anthropic/<concrete-id>` on **every** agent. The v2.119.2
  fix resolved the *invalid-id* half (bare alias → concrete id) but NOT: (a) the model on
  the **primary** (still emitted — should be dropped), and (b) provider-agnosticism /
  freshness.
- **The real installer fix:** the transform emits **no `model:` on the primary** and
  tier-labeled subagent models **resolved via the curated map + models.dev** (one-set
  default; optional profile generation). `/th:update-models` re-runs the same resolver to
  keep installed configs current.

## Reference

gentle-ai (opencode-first): its shipped agents are model-less by default, its `sync`
bakes concrete literals, and "profiles" are suffixed agent sets switched with Tab —
confirming: static literals in files, variability via regeneration.
[docs/opencode-profiles.md](https://github.com/Gentleman-Programming/gentle-ai/blob/main/docs/opencode-profiles.md)
