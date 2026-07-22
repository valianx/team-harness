# opencode model configuration

How team-harness assigns models to opencode agents. The default is the
**model-less baseline**: opencode agents carry no `model:` field, so the whole harness
follows the operator's runtime model selection on any provider. An **opt-in,
additive per-provider cost-tiering layer** (issue #424) sits on top of this baseline —
see "Per-provider cost tiering (opt-in, shipped)" — and bakes a concrete model id per
agent for one selected provider when the operator turns it on. This supersedes the
earlier "profiles-first", "inherit-everywhere", and "resolver-baked-tiers" framings in
this file's history.

## Decision: model-less agents (the v1 baseline)

Every opencode agent th ships — the primary leader **and** every subagent —
is emitted with **no `model:` line**. Consequences (per opencode's own inheritance
rules, confirmed below):

- **Primary (leader):** inherits the **globally selected model** — the
  operator's `/model` pick at runtime.
- **Subagents:** inherit the **model of the primary that invoked them**.

So picking a provider/model once via `/model` moves the entire harness onto it.
Switching provider is a single `/model` change — every agent follows. No baked id,
no provider lock-in, and no `ProviderModelNotFoundError` from an id a given
provider does not serve.

**The tradeoff — uniform cost.** Because subagents inherit the primary's model,
**every agent runs at the selected model's tier**. A cheap validation step costs the
same as the leader. This is the deliberate v1 baseline: it runs on every
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

## Per-provider cost tiering (opt-in, shipped — issue #424)

Cost differentiation is added **for one provider at a time**, as each is adopted —
never forced up front. Because opencode requires a static literal (rule 1) and a
model-less subagent cannot be a lower tier (rule 3), tiering means **baking a concrete
`provider/model-id` into every agent**, derived from that agent's CC source tier. The
default (no opt-in) stays model-less, byte-identical to the v1 baseline.

**Anthropic is the only launch provider.** The architecture is provider-generic — the
curated maps are keyed by provider, and the resolver takes a provider argument — so
adding a provider later is a checked-in map edit, not a code change.

1. **Curated provider→tier→family map (checked into the repo, three sites byte-identical).**
   Per provider, each tier label (`default`/`medium`/`low`, mapping from CC
   `opus`/`sonnet`/`haiku`) → a model family/base name. Ragged — only the tiers a
   provider's current generation actually exposes. Missing tier → nearest cheaper
   neighbor; worst case, one curated model serves every tier. The same map (and its
   release-time concrete-id pin) is declared at three sites and locked by a structural
   parity test so they cannot drift:
   - Go installer: `cmd/install/transform.go` — `providerTierFamily` / `providerTierConcrete`
   - JS contributor tool: `tools/harness-migrate/migrate.mjs` — `PROVIDER_TIER_FAMILY` / `PROVIDER_TIER_CONCRETE`
   - Skill (embedded copy + live resolver): `skills/update-models/SKILL.md`
   - Parity lock: `cmd/install/tier_test.go` (`TestProviderTierMaps_CrossSurfaceParity_AC8`)
2. **Install-time bake = release-time pin, no network.** `--opencode-tier <provider>`
   (installer flag) or the persisted config key `opencode.cost_tier_provider`
   (`~/.claude/.team-harness.json` / the opencode-side copy, merge-write-whole-document)
   selects the provider. The CC→opencode transform then reads each agent's CC source
   `model:` (opus/sonnet/haiku), resolves tier → family → the **release-time pinned
   concrete id**, and emits `model: <provider>/<concrete-id>`. No network call at
   install. Absent selection ⇒ unchanged model-less baseline.
3. **`/th:update-models` live refresh.** Resolves `(provider, family) → newest concrete
   by release_date` from the live models.dev API (`data[provider]["models"][bare_id]`,
   grouped by the model's `family` field — the real nested shape, not a flat
   provider-prefixed map) and rewrites the baked `model:` lines to the freshest version.
   **Never mix providers** — when the selected provider differs from what is currently
   baked, the whole installed set is regenerated for the newly selected provider rather
   than incrementally patched.

The helper `toProviderPrefixedModel` (`transform.go` / `migrate.mjs`) — the prior
alias→concrete pin — was lifted into the provider-keyed `providerTierFamily` /
`providerTierConcrete` maps above; it is retained for the reverse (opencode→CC)
direction.

CLI surface:

```shell
install --runtime opencode --opencode-tier anthropic
# bakes: leader → anthropic/claude-opus-4-6; implementer → anthropic/claude-sonnet-4-6;
#        init/researcher → anthropic/claude-haiku-4-5
/th:update-models   # later: refreshes those ids to the newest live versions per tier
```

## Reference

- opencode docs: [Agents](https://opencode.ai/docs/agents/), [Config](https://opencode.ai/docs/config/)
- [opencode#6651 — Dynamic model selection for subagents via Task tool](https://github.com/anomalyco/opencode/issues/6651)
- gentle-ai (opencode-first): ships model-less agents by default; its `sync` bakes
  concrete literals; "profiles" are suffixed agent sets switched with Tab —
  confirming static literals in files, variability via regeneration.
