# opencode model configuration

How team-harness assigns models to opencode agents. The current decision is the
**model-less baseline**: opencode agents carry no `model:` field, so the whole harness
follows the operator's runtime model selection on any provider. Per-provider cost
tiering is a deferred, additive step (see "Future: per-provider tiering"). This
supersedes the earlier "profiles-first", "inherit-everywhere", and
"resolver-baked-tiers" framings in this file's history.

## Decision: model-less agents (the v1 baseline)

Every opencode agent th ships — the primary orchestrator **and** every subagent —
is emitted with **no `model:` line**. Consequences (per opencode's own inheritance
rules, confirmed below):

- **Primary (orchestrator):** inherits the **globally selected model** — the
  operator's `/model` pick at runtime.
- **Subagents:** inherit the **model of the primary that invoked them**.

So picking a provider/model once via `/model` moves the entire harness onto it.
Switching provider is a single `/model` change — every agent follows. No baked id,
no provider lock-in, and no `ProviderModelNotFoundError` from an id a given
provider does not serve.

**The tradeoff — uniform cost.** Because subagents inherit the primary's model,
**every agent runs at the selected model's tier**. A cheap validation step costs the
same as the orchestrator. This is the deliberate v1 baseline: it runs on every
provider out of the box. Cost differentiation is added later, per provider, as each
is actually adopted.

## opencode rules we must obey (empirically confirmed)

1. **An agent's `model:` is a static literal** in the form `provider/model-id`
   (e.g. `anthropic/claude-haiku-4-5`). There is **no runtime variable, alias, tier
   label, or `inherit` keyword** — opencode does not resolve `model: {tier}`.
   (opencode docs, confirmed 2026-06-22.)
2. **Omitting `model:` triggers inheritance**, and inheritance differs by role:
   primary agents use the **globally configured model**; subagents use the **model of
   the primary that invoked them**. (opencode docs, verbatim: *"If you don't specify a
   model, primary agents use the model globally configured while subagents will use
   the model of the primary agent that invoked the subagent."*)
3. **A model-less subagent is NOT a cheaper tier.** It inherits the primary's model,
   i.e. the same (default) tier — not a low/medium tier. **The only way to make a
   subagent cheaper than the primary is a baked concrete literal.** There is no
   model-less way to express a lower tier. This corrects an earlier assumption that
   dropping `model:` would yield provider-agnostic tiering — it yields uniform cost.
4. **No alias/tier indirection exists in config.** There is no `provider` section or
   named-model abstraction agents can point to. `small_model` is a separate global key
   reserved for opencode's own lightweight tasks (e.g. title generation) and is **not**
   referenceable by agents.
5. A native per-subagent tier (`model_tier`: quick/standard/advanced with global
   mappings) is an **open, unshipped feature request** —
   [opencode#6651](https://github.com/anomalyco/opencode/issues/6651) (PR #11377
   pending, no maintainer commitment as of 2026-06-22). If it ships, runtime tiering
   becomes native and the resolver below can be retired.

## How the installer emits it

The CC→opencode transform (`cmd/install/transform.go`, `tools/harness-migrate/migrate.mjs`)
projects each CC agent/command to opencode frontmatter and **drops the `model:` field
entirely** — for both the agent and command surfaces. The CC source files under
`agents/` keep their `model:`/tier (they remain the canonical Claude Code artifacts);
only the opencode projection is model-less.

The cross-language behavior is locked by `cmd/install/testdata/transform-conformance.json`
(asserted by both the Go and the JS test runners) — the model-drop is encoded there so
the two implementations cannot diverge.

## Future: per-provider tiering (additive, opt-in per provider)

When cost differentiation is wanted for a specific provider, it is added **for that
provider only**, as each is adopted — not forced up front. Because opencode requires a
static literal (rule 1) and a model-less subagent cannot be a lower tier (rule 3),
tiering means **baking a concrete `provider/model-id` into the cheaper subagents**.
The intended mechanism is a resolver:

1. **Curated family→tier map (checked into the repo).** Per provider, each tier label
   (`default`/`medium`/`low`, mapping from CC `opus`/`sonnet`/`haiku`) → a model
   family/base name. Ragged — only the tiers a provider's current generation actually
   exposes. Never backfill a missing tier with a previous-generation model (an older
   model is sometimes *more* expensive). Missing tier → nearest cheaper neighbor.
   Worst case: one model does everything.
2. **models.dev version resolution.** For each `(provider, family)`, pick the newest
   concrete version by `release_date`. Because the source is models.dev (opencode's own
   catalog), the resolved ids are valid for opencode.

`/th:update-models` and the installer transform would re-run this resolver to rewrite
the cheaper subagents' model lines. The helper `toProviderPrefixedModel`
(`transform.go` / `migrate.mjs`) is retained for this path and for the reverse
(opencode→CC) direction. **Never mix providers** — a tiered set is generated for one
selected provider; switching provider re-generates the whole set.

## Reference

- opencode docs: [Agents](https://opencode.ai/docs/agents/), [Config](https://opencode.ai/docs/config/)
- [opencode#6651 — Dynamic model selection for subagents via Task tool](https://github.com/anomalyco/opencode/issues/6651)
- gentle-ai (opencode-first): ships model-less agents by default; its `sync` bakes
  concrete literals; "profiles" are suffixed agent sets switched with Tab —
  confirming static literals in files, variability via regeneration.
