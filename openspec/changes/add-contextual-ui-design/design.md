## Context

See [proposal](proposal.md) for the product scope. Existing `design`, `sketch`, `workspace` and `research-app` contracts supply native coordination, selected workspace and maintained-provider boundaries. `sync-skills.mjs` discovers top-level skills and generates Codex/OpenCode adapters without a new registry or mapping. Codex modes discovers sibling frontmatter; the canonical catalog supplies Claude/OpenCode discovery.

Current source/help research is a documentation hit at Impeccable revision `245ad82def45831dc56a21b683c7a1ff530b06cc`: package/plugin/skill `4.5.2`, engine `0.1.14`, Node `>=22.18`. Main's isolated Codex install/context smoke passed with matching installed identities, correct empty-project context and no active hook. It proves executable preparation and launcher success; live-host discovery, app rendering and visual quality were not tested. This repository feature changes no frontend or database, so no synthetic preview is required.

## Goals / Non-Goals

**Goals:** One thin portable entry that binds product context and the selected upstream capability, preserves authorized continuity and makes visual results and limits reviewable.

**Non-Goals:** [Proposal exclusions](proposal.md#non-goals) apply. TH does not own upstream design methods or project records and adds no general setup/update provider plumbing.

## Decisions

### 1. Use one entry and one dependency reference

Create `skills/ui-design/SKILL.md` for product/endpoint intake, conditional research, existing workflow links and visual-result handoff. Its focused `references/impeccable.md` owns supported dependency identity, preparation, invocation and fallback facts. Signed payloads, host-specific effects and ownership justify that reference. Keep each new maintained document and this design within 80 lines; discovery uses existing sections within the normal documentation budget.

Impeccable offers the researched context and critique support. Frontend Design is lighter but has less operational guidance; Pro Max's catalog alone does not establish application fit. A TH-owned visual engine would duplicate upstream procedures and update obligations. The dependency remains external; neither file copies its playbooks or tool catalog.

### 2. Prepare a selected active-runtime capability

Reuse a usable installation. For authorized preparation, verify current official help and owner records, select the active provider and established scope, and omit optional hooks. Verified Codex project installation is `npx impeccable install --providers=codex --scope=project --no-hooks`; relevant providers are `codex`, `claude`, `opencode` and scopes `project`, `global`. Preserve unrelated files/configuration and never use `--force` to bypass malformed ownership records.

Verified maintenance is `npx impeccable update --scope=project --no-hooks`. It has no provider selector and refreshes all providers recorded in that scope: inspect the actual effect and use it only within authorization, otherwise retain usable work and report the limitation. Updating TH does not update Impeccable. npm pinning does not pin the current signed skill bundle; record actual installed skill, package/source and engine identities separately. File presence does not prove native discovery or usability.

Source evidence: [official installation](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/README.md), [installer operations](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/crates/skills/src/commands.rs), [bundle resolution](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/crates/skills/src/bundle.rs) and [provider layouts](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/crates/skills/src/providers.rs). Installed help/payload governs later invocations.

### 3. Follow installed methods and preserve project authority

Resolve the actual installed compiled skill root and matching references; run its `scripts/impeccable context` launcher once from the target app, with a named target when applicable. Load the skill directly in each host: OpenCode's slash bridge starts build/subtask and would change TH's flow. Do not use unresolved source templates. Upstream autonomy/delegation advice is workflow evidence and grants no new effects, permissions or coordination authority.

Supported launcher refusal/failure permits disclosure, reading existing `PRODUCT.md`/`DESIGN.md` and the permitted playbook. Manual/browser critique can be a disclosed detector fallback, but applicable finish captures remain required. New-direction rolls use the upstream service; neither unavailable tools nor telemetry opt-out establishes offline equivalence. Upstream product/design records, metadata, configs, surface briefs and artifacts retain their owner-project locations. TH workspace holds readiness, source/adaptation rationale and verification links without competing design authority.

Source evidence: [compiled skill](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/.agents/skills/impeccable/SKILL.md), [launcher](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/skill/scripts/impeccable), [OpenCode bridge](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/.opencode/commands/impeccable.md) and [finish reviewer](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/skill/agents/impeccable-finish-reviewer.md).

### 4. Resolve direction on the real surface and honor the endpoint

Read incumbent assets and supplied references first. Unsettled/replaced identity or color triggers bounded relevant internet research with selected links, observations and adaptation reasons. Alternatives resolve only a material open direction on the same actual representative screen; routine settled-brand refinement requires neither fresh research nor comparison. Upstream [new-work](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/skill/reference/new-work.md) and [colorize](https://github.com/pbakaus/impeccable/blob/245ad82def45831dc56a21b683c7a1ff530b06cc/skill/reference/colorize.md) own visual procedures, semantic roles and accessibility/state/theme assessment. Preserve incumbent stack/components without prescribing libraries or color-space migration.

Reuse `design`, `sketch` and `workspace`, reconciling existing OpenSpec intent. Present or reuse the accurate structural wireframe before frontend implementation; a visual comp does not silently replace it. Design-only ends at a reviewable visual deliverable without production changes. Explicitly requested implementation continues within authorization after material decisions, through scoped checks and upstream rendered assessment. Unrunnable apps can use freshness-checked fixtures as qualified evidence; fresh rendering and missing finish evidence remain pending.

## Ownership and Verification

One bounded implementer owns the following assembly; Main owns coordination, selected independent semantic review, completion and final candidate inspection. Preserve others' changes and keep smoke/research output in the selected workspace.

| Surface | Owned files / result |
| --- | --- |
| Entry/discovery | `skills/ui-design/**`; existing sections of `README.md`, `skills/README.md`, `skills/modes/SKILL.md` |
| Generated distribution | `plugins/team-harness/skills/ui-design/**`, `installer-assets/opencode-skills/ui-design/**`, and generator-derived supporting/discovery updates |
| Release | Minor `3.44.0` in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` plugin entry, `plugins/team-harness/.codex-plugin/plugin.json`, `cmd/install/main.go`; one `CHANGELOG.md` outcome and one `docs/knowledge.md` decision line |
| Living intent | Main synchronizes `contextual-ui-design` and the complete affected `native-workflow-entry` requirement, then removes completed archives after checking preserved intent |

Run `node tools/codex-runtime/sync-skills.mjs`, its `--check`, `bash tests/run-all.sh`, strict OpenSpec validation and applicable completion review. Inspect the complete canonical/generated diff and relative references. Role inputs do not change, so role generation is unnecessary. Add no prose-regex or model-compliance tests; CRAP is inapplicable without changed executable functions. Base-tree results remain baseline evidence; candidate checks cover new artifacts/distribution and renew after affected corrections.

## Acceptance Criteria

| AC | Accepted result | Evidence |
| --- | --- | --- |
| AC-1 | All three hosts expose `ui-design`, distinguish `design`/`sketch` and preserve Main's coordination. | Projection/check and discovery/reference review. |
| AC-2 | New/refine/redesign paths use actual task/identity; refinement preserves brand/stack/components and material scope gaps stay explicit. | Semantic review against delta scenarios. |
| AC-3 | Reuse healthy active capabilities; preparation preserves owner/provider/scope, omits hooks by default and distinguishes installed/discoverable/usable and multi-provider update limits. | Verified source/help, isolated smoke and fallback review; no live-project install. |
| AC-4 | Matching installed upstream procedures govern supported work; advice grants no authority and missing capabilities are not claimed as executed. | Source/launcher and authority/fallback review. |
| AC-5 | Open direction uses sourced relevant research and material real-screen alternatives; settled-brand refinement skips both; upstream owns semantic/accessibility checks. | Review both conditional paths and researched playbooks. |
| AC-6 | Design-only ends with a visual result; explicit implementation reuses accurate sketches, intent and authorization, then performs scoped code/render validation. | Endpoint, preview and continuity review. |
| AC-7 | Owner-project design records and one selected workspace remain coherent, with retained rationale and evidence links. | Ownership/destination and relative-reference review. |
| AC-8 | Fresh renders, qualified fixtures, partial results and pending checks remain distinct; readiness/source/tests imply no quality or benchmark claim. | Evidence/fallback review, repository checks and candid coverage report. |

## Risks / Trade-offs

- Signed bundle and package identities can diverge → resolve actual installed payload and matching references.
- Multi-provider updates and owned runtime files expand effects → inspect real scope/ownership and retain pending maintenance when unauthorized.
- Service, engine, host discovery or app runtime can be unavailable → supported partial work and explicit missing finish evidence.
- Relevant references and green checks do not prove visual fit → real-surface upstream critique; no measured quality claim in this release.

## Migration Plan

Distribute the entry through existing skill sync and the normal `3.44.0` release. Consumer preparation occurs only when selected/authorized, not during repository authoring or routine TH setup/update. Main completes applicable verify/archive synchronization and checks living intent before removing completed archives. A reviewed rollback removes the entry/discovery, regenerates projections and reconciles living intent/release metadata; it does not uninstall independently owned Impeccable or delete consumer design records.
