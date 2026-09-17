# Spec coordination reference

Use this reference only when the work needs a recoverable workspace plan,
sequential repositories, or an independent review of a committed candidate.
It describes useful coordination methods; it does not create a pipeline, gate,
lease, quota, nonce, or publication authority.

## Workspace plan and resumption

When the active runtime exposes it, use the existing
[workspace identity helper](../../pipeline/scripts/workspace-identity.mjs) as a
read-only library. It is a convenience for a single workspace with one
writable repository and `feature`, or an initiative with two or more writable
sibling repositories and `initiative`. Supply the configured `logsMode`,
`logsPath` and `logsSubfolder`, repository bindings with stable identities, and
the creation date. If a valid persisted identity exists, reuse it instead of
deriving a new path. An evidence-only repository may be included for comparison
or fixtures. If repositories are not siblings, or the helper is unavailable,
keep one explicitly recorded shared plan in the initiating repository's
configured workspace; do not create a new control protocol just to resolve it.

Create `01-plan.md` from [../assets/plan.md](../assets/plan.md) only when the
work benefits from a shared progress view, delegation, or resumption. For an
initiative keep one plan at the coordinator root; do not copy it into every
service workspace. Record the `mode: spec`, change slug, canonical OpenSpec
source, repositories, branch and resolved revision where known, current task
progress, checks, unresolved decisions, and next action. Return or link the
exact plan path when handing work back. `recover` should verify those facts
against the current worktree before continuing; an old note or control log is
context, not current authority.

The plan is a reading view, not a second task list. Link proposal, tasks,
design, specs, review evidence and PR from it, and derive progress from the
canonical tasks. Refresh it after a material intent or repository change, at
validation, and at delivery. A direct one-repository task can proceed without
one.

## Sequential repositories

When one objective crosses repositories, inspect each repository's instructions
and identify the dependency order before writing. Implement and validate the
prerequisite first, then adapt its consumers. In the common plan, record for
each repository the owner, path, branch or revision, dependency and evidence.

Before changing a consumer, verify it against the prerequisite's exact local
commit (resolve a moving branch before recording it), published artifact
version, or a contract fixture. Record which reference was checked and its
resolved revision when one exists. Do not require a merge or deployment just to make
the consumer check possible; if a deployed dependency is unavoidable, mark
that check pending and continue independent work. A newly discovered
repository or contract outside the approved intent needs only the missing
scope decision, not a new pipeline ceremony.

Keep separate branches and validation evidence for separate repositories. Use
each repository's OpenSpec change and archive completed, verified changes with
their implementation in the corresponding delivery PR. Revisit links after an
archive. Repository count alone does not require the pipeline.

## Same-candidate advisory review

After relevant checks pass and a committed candidate exists, Main may use the
current [verify workflow](../../verify/SKILL.md) to package the exact candidate
with `review-fan.mjs package` and give its immutable evidence to selected
read-only reviewer roles. Read that skill for the supported helper interface.
For an archived OpenSpec change, pass its exact
`archive/YYYY-MM-DD-<change>` reference with `--change`. Reviewers should
return findings, evidence, coverage and uncertainty for that candidate; Main
consolidates recommendations in the full task context.

If the candidate changes, validate the affected behavior and package the new
head as a new evidence point when another review is useful. Keep the original
finding and its disposition; do not relabel an old verdict to make it pass.
Use the review route when it adds confidence, not as a universal helper gate.
