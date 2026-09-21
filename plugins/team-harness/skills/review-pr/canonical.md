
Analyze `$ARGUMENTS`. Accept a PR number (`45`, `#45`) or URL; remove options before parsing it.

## Options

- `--reviewers <focus[,focus]>`: request explicit lenses. `general` and `architecture`
  use reviewer passes; `security` selects the security specialist.
- `--multi`: shorthand for `--reviewers general,architecture`.
- `[TIER: N]`: compatibility context. Tier 4 emits a security recommendation; only an explicit
  `--reviewers security` selection adds the specialist.
- `--resume-from-draft`: publish a saved draft only after snapshot validation.
- `--auto-publish`: operator opt-in to skip the preview menu.
- `--converge`: compatibility alias for `--multi`; one set of independent passes, never a loop.
- `--regressions`: investigate concrete suspected regressions with bounded base/head probes.
  An explicit live request to investigate regressions selects the same behavior.
- `workspaces path: <directory>`: optional coordinator-supplied acceptance workspace, including
  Obsidian; capture its relevant context before dispatch as described in the snapshot reference.

Existing review maintenance remains available through the same Main-owned run: an `update-body`
request revises the captured review draft, and a `reply` request drafts a response to a selected
review thread. Both reuse the immutable snapshot, currentness checks, artifact ownership, and
publication contract below; they do not start a second Review Mode coordinator. Use
`apply-review` when the request is to evaluate and incorporate reviewer comments into code.

## Non-negotiable invariants

1. Main coordinates through the active runtime's native dispatch tools. PR-review specialists
   advise with scoped read access; they never edit, publish, change coordinator state or delegate.
   Main owns synthesis and evidence-backed decisions. Do not spawn another orchestrator.
2. Bind technical results to `head_oid` and `technical_hash`; bind conversation-aware drafts,
   previews, and GitHub writes to the current `context_hash`.
3. Review the detached worktree, never the operator's checkout or a moving branch.
4. Fail closed when code or semantic conversation freshness cannot be verified.
5. Never publish without preview and explicit approval unless `--auto-publish` was supplied.
6. Publish one atomic GitHub review containing `body`, `event`, `commit_id`, and `comments`.
7. Keep each finding in one public channel:
   - an anchored finding lives in an inline thread;
   - a genuinely cross-file finding lives in the review body;
   - the body may count inline findings but must not repeat them.
8. Preserve every supported blocking finding. Brevity removes repetition and optional commentary, never blockers.
9. Every Blocking finding the operator reads has been checked against the frozen code by the
   verifier, or the coverage line says why not.
10. Store each review in its own helper-created
    `workspaces/pr-review-{number}/run-{owner-token}/` directory. Never use `.claude/` for review
    state.
11. Drive the mode to a review outcome. A code blocker becomes a `REQUEST_CHANGES` finding; it
    never blocks the review workflow. Stop only when a trustworthy review cannot be verified or
    published because an external prerequisite remains unavailable, or when an already-published
    review on the same head contains every current finding.

## Operator-facing communication

Keep snapshot mechanics internal. Operator updates explain who is working, what each specialist
is checking, and what decision comes next; they do not narrate skill reads, preflight checks,
worktree setup, immutable-SHA binding, context hashes, artifact paths, or wait-tool lifecycle.

At startup, announce only that Team Harness will prepare a PR review and, without
`--auto-publish`, that nothing will be published before approval. After selecting specialists,
announce the exact agents and their useful scope against the concrete changed surfaces:
`reviewer` (correctness, regressions, API/data contracts), `pr-review-qa` (acceptance evidence),
`pr-review-security` (permissions, input validation, trust boundaries), and `pr-review-verifier` (confirmation of every
blocking finding against the frozen code, unless the repository policy turns verification off).
Do not call agents abstract "lenses" in operator-facing prose.

Never emit a message whose only content is tool-status narration; during an extended wait, name
the active specialists and their surfaces. Expose SHAs or the context hash only when identity
drift blocks the review or the operator asks. Report whether the Git local exclude was already
present or added once.

## Resume

Resolve exactly one complete isolated run with `review_context.py resume-run` (context, non-empty
body draft, and inline JSON), capture a fresh context, and run `review_context.py compare`.
`continue` resumes at Preview; `reconcile-conversation` refreshes the conversation, reruns
same-author/prior-review detection, reconciles the draft once, and returns to Preview without
rerunning specialists; `restart-technical-review` discards the draft and restarts at Gather. A
capture failure or missing snapshot identity stops; never publish a stale draft.
The resume helper locates a candidate, not proof that its coverage is complete. Before Preview,
require and read every source coordinate recorded for every selected pass in the ledger, including
suffixed and zero-finding reports, original verification input, verifier return with its identity
(unless policy was off), and Main's finding ledger. Reconcile every source finding and validate
the recorded technical identity. Missing evidence requires recovery from retained validated
returns or a fresh assessment; never infer successful coverage from a saved review body.
When the ledger records workspace context, require its captured manifest and every listed leaf,
verify their saved hashes and technical identity, and reuse those bytes. Missing or changed
workspace evidence requires a fresh assessment; never substitute the current live workspace.

## Workflow

Load the following references when entering their phase, resolving paths against this skill.
Main owns the review run and final decisions; specialists need their role and scoped input packet,
not these coordinator instructions or other specialists' initial conclusions.

1. **Capture.** Read [snapshot.md](references/snapshot.md). Resolve the bundled helper, check
   shared prerequisites, prepare the owned immutable run, read base policy and prior-review
   identity. Preserve the snapshot until every reader has joined and integrity checks finish.
2. **Assign and review.** Read [coordination.md](references/coordination.md). Map fixed coverage
   obligations to risks and dependencies, check only selected native roles and effective
   permissions, and dispatch independent assessments with progressive context. Apply the
   pre-dispatch freshness check from the snapshot reference immediately before dispatch.
3. **Consolidate.** Follow the coordination reference to validate identities and integrity,
   repair an incomplete return once against the same snapshot, and reconcile conversation drift.
   Main accounts for every source finding in the existing ledger, including duplicate,
   discarded and unresolved claims. The compatibility consolidator is not required.
4. **Verify.** Read [verification.md](references/verification.md). When explicitly requested,
   investigate concrete regressions through the existing isolated probe helper. Use an
   independent verifier for the policy-selected claims. Assessments are advisory: Main records
   evidence-backed dispositions without silently changing the source assessment.
5. **Preview and publish.** Read [publication.md](references/publication.md). Validate the final
   body, anchors, coverage and all-finding ledger, then present the exact review for approval.
   Recheck freshness and exact approved bytes before a single atomic GitHub review write.
   Finish the coordinator-owned cleanup described in the snapshot reference.

If a phase is resumed, read that reference and the retained identity/coverage evidence before
acting. Do not replace a required integrity check with a summary or an agent's assertion.

## No input

Ask for a PR number or URL and stop.
