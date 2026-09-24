---
name: create-pr
description: Prepare every completed repository change for a pull request and publish under existing authorization, from direct, OpenSpec, or Team Harness pipeline flows. Also resume an intended PR creation. Do not use for PR review, applying review comments, or merge-only work.
---

Analyze `$ARGUMENTS` by the requested action before extracting any PR number or URL. A number
or URL identifies the target; it does not choose the workflow. Route a request to review an
existing PR to `review-pr`, a request to evaluate or apply its comments to `apply-review`, and a
merge-only request to the repository's merge flow. Enter this skill only for preparing or
publishing a PR from completed repository work.

Use this shared skill at two checkpoints in one PR lifecycle. Every completed
repository change enters candidate preparation through create-pr, whether it
changes code, tests, documentation, configuration or generated assets, and
whether it began as direct, spec, pipeline or another writing workflow. PR
publication is the normal completion path under the operator's existing
authorization and native permissions; honor an explicit earlier stop. A
resumed run reuses its preparation and authorization. A mere PR mention in
unrelated work or a review-only request does not activate it. Skill selection
itself never grants merge or issue-closing authority.

Do not route review of an existing PR, application of review comments, or a merge-only
request through this skill; use `review-pr`, `apply-review`, or the repository's merge
flow. The coordinator owns this workflow. Do not create a nested orchestrator, require
a specialist by default, or weaken native runtime permissions. Keep the instructions
portable across Claude Code, Codex, and OpenCode by using the active runtime's native
tools and existing repository helpers.

## Checkpoint 1: prepare the candidate

This is candidate assembly within [the shared development phases](../spec/references/development-phases.md).
Recover the existing plan, selected capabilities and exact evidence links. Resolve
missing relevant validation within the authorized scope; do not restart completed
stages, relabel stale receipts or treat pending accepted review as declined.
Preparation may occur during Validation; outward publication follows it.

Before final review or publication authorization, resolve the exact repository, working branch,
base, candidate head, and intended PR scope. Respect repository instructions, project
branch conventions, PR templates, commit conventions, and native permissions.
Read those conventions while planning validation, not after declaring PR readiness:
include required release metadata, generated copies and supported test environments
in candidate preparation. Reuse a version bump already included in this PR.
In the Team Harness repository, distributed runtime input changes require
the four synchronized version sites and a matching CHANGELOG release heading
in this candidate. Prepare them before declaring the candidate ready.
Local implementation and validation precede PR preparation; report their
completion separately from the prepared or published candidate.

Before committing, resolve native Git authorship and the required commit format.
Reuse a configured or already established author; do not invent one from an
unrelated commit or change global settings to repair a local gap.

- Inspect the full base-to-candidate diff and worktree status. Preserve unrelated
  tracked or untracked changes; do not stage, discard, or fold them into the PR.
- Keep maintained tests, tools, fixtures, and required shipped generated outputs that
  belong to the candidate. Keep transient reports, logs, and scratch material in the
  existing workspace or a temporary directory; do not add them to the repository.
  Apply [workspace's artifact guidance](../workspace/SKILL.md#keep-context-useful)
  in every consumer repository, including provider-generated work files and local
  installations. A necessary durable project artifact may remain; explain its role
  rather than treating every generated or Markdown file as disposable.
- Reuse verification that still applies to this exact candidate and scope. Run the
  selected required checks when needed, and report omitted checks, their reasons, and
  unknown counts honestly. Unrelated optional skips do not erase sufficient evidence.
- When OpenSpec is relevant, read [the shared lifecycle](../spec/references/lifecycle.md)
  and follow its upstream implementation-verification and archive readiness
  contract. Confirm the relevant upstream verify ran on applicable implementation
  evidence; a structural validate result or declined optional review does not
  replace it. Reuse completed provider stages from spec instead of rerunning them
  solely for PR preparation. Preserve
  OpenSpec's repository archive contract; do not invent external archive support or
  silently auto-delete history.
  Otherwise do not create OpenSpec artifacts for this PR task.
- When author review applies, read [the author-review contract](../spec/references/author-review.md).
  A pending review choice holds publication, an explicit refusal skips only optional
  review, and accepted review returns and any repair closure must remain anchored to
  the candidate. Reuse applicable evidence rather than starting an unrequested full
  review round.
- Direct and spec flows create no new pipeline state, gates, or checklist files. Reuse
  an existing workspace or temporary body file, and add no scripts, generated copies,
  or duplicate lifecycle content as new administrative preparation material.

Prepare the title, body, issue references, and any required metadata from the repository
template and approved scope. Use closing keywords only for issues fully resolved by the
candidate; reference a partially resolved issue without auto-closing it. Keep the
candidate reviewable and report the files inspected, prepared, or retained with the
rationale for any scope decision.

This preparation/publication method is shared by direct, spec and pipeline work.
Main normally executes it. A pipeline delivery specialist can perform the assigned
checkpoint with the same evidence and endpoint; it does not need a second acceptance
matrix or legacy report layout. Main retains decisions and coordinates Git writes.

## Checkpoint 2: publish or resume

Recover the GitHub identity already established for this repository/effort and
resolve any configured route through the installed [setup](../setup/SKILL.md)
GitHub identity helper for the active runtime. A temporary worktree path or the
globally active account does not override retained repository identity. Verify
the selected account and target access before the first write, using native
credential facilities and the existing isolated route or supported process scope.
Keep credentials out of output, files and PR bodies; preserve unrelated account
settings. If identity is genuinely unresolved, ask only for that missing choice.

Publication reuses the completed preparation and its existing authorization. Revalidate
the exact repository, base, head commit/tree, branch, worktree, body bytes, and applicable
candidate review or authorization evidence before an outward write. A direct/spec ordinary in-scope repair
may advance the head or revise its body after this diff check while reusing existing
authority; ask only for a decision when scope, acceptance, security authority, or another
real prerequisite is new. Pipeline work follows the same rule: distinguish the
reviewed and corrected candidates, renew affected evidence, and reuse the existing
authority when its scope still applies. Metadata repairs do not restart unrelated
validation or create another approval step.

Publish the prepared candidate once applicable completion and author-review
conditions are satisfied. If preparation changes the candidate, verify the changed
surface before the outward write. A native permission prompt remains a technical
boundary; it is not silently answered by this skill.

Before push or PR creation in the Team Harness repository, run
`node tools/codex-runtime/version-preflight.mjs --base <base-ref> --head HEAD`
on the committed candidate. Use the actual target base ref; do not substitute
an unavailable ref or skip a failed check. Repair release metadata and rerun
the check before publication. CI runs the same helper, but its later result
does not replace this local preflight.

Make the operation idempotent: first inspect for a PR in the exact repository with the
exact head and base. If a network or transport result is uncertain, inspect that exact
state before retrying; never replay an unknown outward write blindly. Preserve an open
ready-for-review PR and surface a merged or closed stale branch according to the delivery
contract.

When `gh` is used, pass explicit `--repo`, `--base`, `--head`, and `--body-file` values
whenever available, and include only flags supported by the installed command. Use a
local temporary body file when needed. Do not fabricate flags or use
`gh pr create --dry-run` as a preview because it may push or otherwise change state.
Reuse the repository's sanctioned fallback when `gh` is unavailable. If push succeeds
but PR creation fails, report the pending PR state and do not push again.

Finish with a concise PR URL and state, plus validation limitations or a precise pending
reason. Do not wait for CI or merge, and do not auto-publish review comments.
