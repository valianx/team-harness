# opencode model configuration

How team-harness assigns models to opencode agents. The default is the
**model-less baseline** for ordinary roles: opencode agents inherit the operator's
runtime model selection. The two completion roles below have explicit Sol defaults.
An **opt-in,
additive per-provider cost-tiering layer** (issue #424) sits on top of this baseline —
see "Per-provider cost tiering (opt-in, shipped)" — and bakes a concrete model id per
agent for one selected provider when the operator turns it on. This supersedes the
earlier "profiles-first", "inherit-everywhere", and "resolver-baked-tiers" framings in
this file's history.

## Decision: model-less agents (the v1 baseline)

Ordinary opencode agents are emitted with **no `model:` line** unless provider
tiering is selected. The completion roles are explicit exceptions. Consequences
for model-less roles (per opencode's own inheritance
rules, confirmed below):

- **Primary (`orchestrator`):** inherits the **globally selected model** — the
  operator's `/model` pick at runtime.
- **Subagents:** inherit the **model of the primary that invoked them**.

Picking a provider/model once moves the model-less roles onto it. Their inherited
selection has no baked provider id; explicitly configured roles retain theirs.

**The tradeoff — uniform cost.** Because subagents inherit the primary's model,
**each model-less agent runs at the selected model's tier**. A model-less validation step costs the
same as the primary. This is the deliberate v1 baseline: it runs on every
provider out of the box. Explicit role defaults and opt-in tiering differ below.

## Explicit completion roles

Direct/spec `spec-validator` and `pr-creator` use `openai/gpt-6-sol` with
`reasoningEffort: high` and `medium` respectively. The role transform applies
these defaults to their canonical Opus sources in both the Go installer and JS
migration route; it leaves concrete custom model choices and other roles alone.
These defaults apply even without Anthropic tiering and do not change the main
agent or existing pipeline roles. The operator must have Sol available through
the configured OpenAI provider; missing access is reported, not silently replaced.

The [OpenCode agent options](https://opencode.ai/docs/agents/#additional) support
provider-specific `reasoningEffort`; [model identifiers](https://opencode.ai/docs/models/#set-a-default)
use `provider/model`. Generated configuration proves the requested mapping, not
account entitlement or live activation. Claude Code keeps native Opus for both roles.

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

### Claude Code alias ownership

The Claude Code source alias `model: opus` remains semantic and is not rewritten
in the canonical agent files. Claude Code 2.1.280 and newer resolve that alias to
Opus 5.5 for Anthropic API, Bedrock, and Google providers. Microsoft Foundry may
continue resolving `opus` to Opus 4.6 or a provider-specific override; that
availability and upgrade decision belongs to the runtime/provider. Team Harness
only uses the alias as the default tier input and pins the opt-in Anthropic
opencode projection to `claude-opus-5-5`. Existing concrete model ids remain
unchanged and pass through as authored. See Claude Code's [model configuration
reference](https://code.claude.com/docs/en/model-config) and Anthropic's [model
overview](https://platform.claude.com/docs/en/models/overview) for the
runtime/provider mappings.

## How the installer emits it

The CC→opencode transform (`cmd/install/transform.go`, `tools/harness-migrate/migrate.mjs`)
projects each CC agent/command to opencode frontmatter and **drops the `model:` field
entirely** — for both the agent and command surfaces. The CC source files under
`agents/` keep their `model:`/tier (they remain the canonical Claude Code artifacts);
the ordinary opencode projection is model-less. A subsequent role-specific layer
applies the explicit completion defaults described above.

The cross-language behavior is locked by `cmd/install/testdata/transform-conformance.json`
(asserted by both the Go and the JS test runners) — the model-drop is encoded there so
the two implementations cannot diverge.

## Per-provider cost tiering (opt-in, shipped — issue #424)

Cost differentiation is added **for one provider at a time**, as each is adopted —
never forced up front. Because opencode requires a static literal (rule 1) and a
model-less subagent cannot be a lower tier (rule 3), tiering means **baking a concrete
`provider/model-id` into every agent**, derived from that agent's CC source tier. The
default (no opt-in) for ordinary roles stays model-less; completion-role defaults
are applied separately.

**Anthropic is the only launch provider.** The architecture is provider-generic — the
curated maps are keyed by provider, and the resolver takes a provider argument — so
adding a provider later is a checked-in map edit, not a code change.

1. **Curated provider→tier→family map (checked into the repo, two sites byte-identical).**
   Per provider, each tier label (`default`/`medium`/`low`, mapping from CC
   `opus`/`sonnet`/`haiku`) → a model family/base name. Ragged — only the tiers a
   provider's current generation actually exposes. Missing tier → nearest cheaper
   neighbor; worst case, one curated model serves every tier. The same map (and its
   release-time concrete-id pin) is declared at two sites and locked by a structural
   parity test so they cannot drift:
   - Go installer: `cmd/install/transform.go` — `providerTierFamily` / `providerTierConcrete`
   - JS contributor tool: `tools/harness-migrate/migrate.mjs` — `PROVIDER_TIER_FAMILY` / `PROVIDER_TIER_CONCRETE`
   - Parity lock: `cmd/install/tier_test.go` (`TestProviderTierMaps_CrossSurfaceParity_AC8`)
2. **Install-time bake = release-time pin, no network.** `--opencode-tier <provider>`
   (installer flag) or the persisted config key `opencode.cost_tier_provider`
   (`~/.claude/.team-harness.json` / the opencode-side copy, merge-write-whole-document)
   selects the provider. The CC→opencode transform then reads each agent's CC source
   `model:` (opus/sonnet/haiku), resolves tier → family → the **release-time pinned
   concrete id**, and emits `model: <provider>/<concrete-id>`. No network call at
   install. Absent selection ⇒ unchanged model-less baseline. A newer concrete id
   requires re-running the installer against a refreshed pin — there is no separate
   live-refresh path.

The helper `toProviderPrefixedModel` (`transform.go` / `migrate.mjs`) — the prior
alias→concrete pin — was lifted into the provider-keyed `providerTierFamily` /
`providerTierConcrete` maps above; it is retained for the reverse (opencode→CC)
direction.

CLI surface:

```shell
install --runtime opencode --opencode-tier anthropic
# bakes: orchestrator → anthropic/claude-opus-5-5; implementer → anthropic/claude-sonnet-4-6;
#        init/researcher → anthropic/claude-haiku-4-5
```

## Reference

- opencode docs: [Agents](https://opencode.ai/docs/agents/), [Config](https://opencode.ai/docs/config/)
- [opencode#6651 — Dynamic model selection for subagents via Task tool](https://github.com/anomalyco/opencode/issues/6651)
- gentle-ai (opencode-first): ships model-less agents by default; its `sync` bakes
  concrete literals; "profiles" are suffixed agent sets switched with Tab —
  confirming static literals in files, variability via regeneration.
