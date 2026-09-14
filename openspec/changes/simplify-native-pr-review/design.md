## Context

See [proposal.md](proposal.md) for the objective. The baseline is integrated main `a2683ae3dedc5d06f5ff3eb96c7cc6b95ef6ab48` (3.29.7). The review skill dispatches a consolidator only for multiple drafts, but Codex preflight requires all five review-role declarations. Verifier labels still determine dispositions mechanically. These are the bounded PR-review changes proposed by #661 and the first simplification experiment in #662.

The same semantics ship through Claude-oriented canonical contracts, Codex projections and OpenCode transforms. Native subagents, tools and permission inheritance differ. A successful Codex run does not establish Claude/OpenCode support.

## Goals / Non-Goals

Use native coordination with one short common PR-review contract and small runtime adapters. Keep existing public commands, policy settings, snapshot helpers, evidence accounting and publication protections. Runtime permissions remain authoritative; this change introduces neither a custom security boundary nor an always-on orchestration service.

The component inventory below records decisions for #662; it does not authorize rewriting research or the pipeline. The PR-review pilot is one deliverable with sequential implementation and comparative validation. The coordinator remains the only writing agent in this spec lane.

## Decisions

### Main owns synthesis and disposition

Keep the existing drafts, ledger, review body and snapshot identifiers. Main reads all returned drafts, deduplicates with source attribution, evaluates disagreements against code, and asks the existing verifier for independent blocker evidence according to policy. A verifier label is an assessment, not an instruction. Unresolved speculation stays explicit and cannot become a proven blocker or a clean approval.

Do not add a second decision agent or a new findings schema merely to express this authority. Initially retain the installed consolidator role as a compatibility asset while removing it from this workflow's required execution and preflight. This avoids making a catalog removal or a running-session refresh a prerequisite for the pilot.

### Required coverage guides native allocation

Keep existing general, QA, security and verification obligations. Main chooses bounded assignments from risks and dependencies, including ownership of cross-component interactions. Preserve explicit operator selections, native concurrency limits and configured model/effort. The initial pass remains independent; later directed questions may reference earlier findings. Useful completed work survives follow-up while its immutable identity remains valid.

The alternative of a new deterministic scheduling classifier would add another policy mechanism without evidence that it improves review quality. Use short operational guidance and existing coverage accounting instead.

### Preserve native boundaries in all three runtimes

| Runtime | Implementation surface | Required validation |
| --- | --- | --- |
| Claude Code | Canonical `skills/review-pr/`, `agents/reviewer*.md`, PR-review lens contracts, and packaged Claude assets | Selected native subagents can read evidence and return findings; editing, nested delegation and external publication are unavailable in their assigned capability set. |
| Codex | `runtime/codex/instructions/`, registry/generator, `skills/review-pr/scripts/review_context.py`, generated agent and skill copies | Selected-role readiness, supported native read transport, effective inherited permissions, same-snapshot recovery, and projection freshness. |
| OpenCode | Existing agent/skill converters, installer assets and runtime-specific review instructions | Its actual supported configuration parses, dispatch and permission names match that version, reviewers retain read access and lack mutation/delegation authority, and implementers retain writing. |

Concrete compatibility gaps: `cmd/install/transform.go` includes all five PR-review roles, while `tools/harness-migrate/migrate.mjs` and its current fixtures omit `pr-review-verifier` from the protected review-role set. `skills/audit-security/scripts/security_scan.py` also omits the verifier from its review-role allowlists. Align these existing producers and checks so the verifier receives the same review-only restrictions; preserve the consolidator as a compatible but unused role. Keep global prerequisites such as GitHub access and review-workspace handling distinct from selected-agent readiness.

Validate installed/supported version capabilities before choosing an adapter. OpenCode V2 documentation is evidence of a current capability, not proof that a V1-shaped configuration accepts V2 field names. Preserve existing supported installations; any incompatible runtime upgrade is separate scope. Likewise, Codex live parent overrides must not be assumed to leave a role-file sandbox default effective. Use existing native capabilities and permitted read transports; where equivalence cannot be established, report the specific missing capability instead of claiming parity.

### Reduce loading and prerequisites at their source

Make the review skill an entrypoint to the pertinent workflow sections and deterministic helper commands. Keep business rules, repository context, severity criteria and tool descriptions discoverable. Limit preflight to selected roles and required capabilities, while retaining snapshot and permission checks. Scope role-contract changes to PR reviewers, QA/security PR lenses, verifier and any retained review consolidator; implementation, pipeline validation and author-side repair roles keep their existing authority.

| Component for #662 | Value retained | Disposition in this change |
| --- | --- | --- |
| PR consolidator stage | Evidence-grounded synthesis and finding accounting | Move execution to Main; preserve legacy role compatibility initially. |
| Fixed review-role preflight | Usable selected roles and native boundaries | Adapt to the selected capability set. |
| Repeated review instructions | Project context, independent assessment and output contract | Keep a short entrypoint and load pertinent detail. |
| Snapshot, integrity, freshness and publication helpers | Identity and approved outward effect | Retain. |
| Fixed research chain | Broad investigation and synthesis when useful | Defer behavioral changes; document a separate experiment. |
| Generic wrappers and pipeline roles | Runtime compatibility, business rules and recoverability where demonstrated | Inventory purpose, inputs/outputs, authority, dependencies, native equivalent and cost evidence; make no blanket removal. |

### Compare outcomes before claiming improvement

Use a small set of frozen historical PRs covering a small change, cross-component/security interaction and a large generated surface; include known defects, false-alarm opportunities and multiple drafts. Review sessions must not receive the reference answers or this conversation's findings. Record runtime versions, exact base/head, model/effort, obligations, tool availability and run settings.

Compare the current workflow with a context/progress-only baseline first. Then change only consolidation/prerequisites, and finally evaluate adaptive allocation on that candidate. This separates savings from smaller context, fewer handoffs and different assignment decisions. Reuse fixtures, not previous reviewers' answers. Repeat cases where stochastic disagreement changes the conclusion.

Record defects found/missed, false positives, coverage, latency, token/tool use, stalls, recovery and authority violations. Validate all three runtime adapters with existing automated suites and native smoke evidence where available; label unexecuted native checks and make no measured-parity claim for them. Keep critical model/effort settings constant. A small pilot supports a bounded retain/adapt/defer decision, not a universal performance claim. This is development evidence, not a new approval gate for every PR.

The focused suite includes `tests/test_review_context.py`, Go installer transform/conformance tests, `tools/harness-migrate/test_harness_migrate.mjs`, `tests/test_opencode_agent_frontmatter.sh`, `tests/test_opencode_config_resolver.sh`, existing security-scan tests, and `tests/test_codex_runtime.py`. Run `node tools/codex-runtime/generate.mjs --check`, `node tools/codex-runtime/test_generate.mjs` and `node tools/codex-runtime/sync-skills.mjs --check` after changing their inputs. Required omitted scenarios remain unverified even when a runner exits successfully; no wording-only tests substitute for behavior or generated-output conformance.

## Risks / Trade-offs

- Coordinator synthesis can lose a finding → retain source reports and reconcile every disposition, including conflicting or duplicated findings.
- Smaller context can miss business constraints → supply relevant context coordinates and permit verified dependency reads; record absent or contradictory sources.
- A native default can accidentally grant writing or delegation → exercise effective capability behavior per runtime; do not infer external-write restrictions from filesystem settings.
- Existing contract prose can reinstate old control → update canonical sources and generated consumers together; inspect the active-change overlap described below.
- Pilot measurements can be noisy or unavailable → record exact conditions and limits, retain the working baseline, and avoid blanket claims or fabricated results.

## Migration Plan

1. Establish the comparison fixtures and relevant runtime capability matrix, then implement the shared PR-review contract and selected-role readiness.
2. Adapt and regenerate Claude, Codex and OpenCode consumers using existing generators/converters. Preserve compatible public role names and invocation forms during the pilot.
3. Reconcile `openspec/changes/pr-regression-evidence/specs/pr-review-independence/spec.md`, whose automatic demotion/drop requirement conflicts with this proposal. Preserve its optional reproduction evidence, identity binding and read-only verifier. Its proposal/tasks and historical delivery must remain attributable; do not mark unrelated unfinished work complete or retire the entire change without evidence.
4. Run the focused correctness/distribution checks and comparative pilot. If results reveal quality or authority regressions, fix within scope or retain the existing behavior and report the outcome rather than silently reducing acceptance.
5. Once implemented and verified, prepare this change's archive and living specs on the same branch before final review. Obtain only any archive or publication authorization not already supplied. Rollback uses the previous compatible workflow/adapters and preserves captured review evidence.

Other active changes: `ground-review-context` complements bounded grounding; `reconcile-specialist-read-contracts` governs pipeline artifacts and remains outside this PR. Existing archive guidance in `openspec/config.yaml` still says after merge; the current shared lifecycle and live operator preference require same-PR archive. Reconcile that stale guidance when assembling this change's closure, without bulk-archiving unrelated changes.

## Research basis

- [OpenAI subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): native delegation, synthesis and live permission inheritance.
- [OpenAI skill and prompt guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): short routing descriptions and progressive context.
- [Claude subagents](https://code.claude.com/docs/en/sub-agents) and [agent teams](https://code.claude.com/docs/en/agent-teams): separate contexts, native tools and differing coordination costs.
- [OpenCode agents](https://opencode.ai/v2/docs/agents) and [permissions](https://opencode.ai/v2/docs/permissions): version-specific native role and capability controls.
- [Anthropic agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): outcome and trace measurements with reproducible tasks.

Sources were reviewed on 2026-09-14. They motivate the design; TH-specific improvements remain to be measured.
