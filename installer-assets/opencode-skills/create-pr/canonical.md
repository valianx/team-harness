
Analyze `$ARGUMENTS` by the requested action before extracting any PR number or URL. A number
or URL identifies the target; it does not choose the workflow. Route a request to review an
existing PR to `review-pr`, a request to evaluate or apply its comments to `apply-review`, and a
merge-only request to the repository's merge flow. Enter this skill only for preparing or
publishing a PR from completed repository work.

Use this shared skill at two checkpoints in one PR lifecycle. Use it whenever a direct PR
request or the spec or pipeline flow reaches candidate preparation or publication; no
explicit skill invocation is needed. A resumed run must reuse its retained preparation
and authorization. A mere PR mention in unrelated work or a review-only request does not
activate it. Skill selection itself never grants push, PR, merge, or issue-closing authority.

Do not route review of an existing PR, application of review comments, or a merge-only
request through this skill; use `review-pr`, `apply-review`, or the repository's merge
flow. The coordinator owns this workflow. Do not create a nested orchestrator, require
a specialist by default, or weaken native runtime permissions. Keep the instructions
portable across Claude Code, Codex, and OpenCode by using the active runtime's native
tools and existing repository helpers.

## Checkpoint 1: prepare the candidate

Before final review or publication authorization, resolve the exact repository, working branch,
base, candidate head, and intended PR scope. Respect repository instructions, project
branch conventions, PR templates, commit conventions, and native permissions.

- Inspect the full base-to-candidate diff and worktree status. Preserve unrelated
  tracked or untracked changes; do not stage, discard, or fold them into the PR.
- Keep maintained tests, tools, fixtures, and required shipped generated outputs that
  belong to the candidate. Keep transient reports, logs, and scratch material in the
  existing workspace or a temporary directory; do not add them to the repository.
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

For an active pipeline, follow its existing delivery mechanics and accepted preview.
From this skill directory, Codex uses `../pipeline/references/delivery.md`, Claude Code
uses `../../agents/_shared/delivery-mechanics.md`, and OpenCode uses
`../../th-references/agents/_shared/delivery-mechanics.md` in the selected installation.
Do not replace that contract with this skill's prose.

## Checkpoint 2: publish or resume

Publication reuses the completed preparation and its existing authorization. Revalidate
the exact repository, base, head commit/tree, branch, worktree, body bytes, and applicable
candidate review or authorization evidence before an outward write. A direct/spec ordinary in-scope repair
may advance the head or revise its body after this diff check while reusing existing
authority; ask only for a decision when scope, acceptance, security authority, or another
real prerequisite is new. An active pipeline keeps the delivery contract's accepted candidate,
review and preview identities; a mismatch returns to validation and rechecks authorization.

An active pipeline publishes its accepted candidate through the existing delivery
mechanics. Once the candidate and its authorization are handed to publication, perform no
edits, tests, commits, rebases, or re-review; validation runs before authorization is accepted. Direct
and spec publication follows their already-satisfied completion and author-review
conditions without inventing a second gate. A native permission prompt remains a
technical boundary; it is not silently answered by this skill.

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
