## Context

See [proposal.md](proposal.md). The review flow already produces a canonical body and an inline JSON of anchored findings bound to `head_oid` and `context_hash`, previews them, anchors the approval to their hashes, and publishes atomically. This change inserts one read-only step between the canonical draft and the preview, and removes the coordinator-owned repair path that grew around reviewer mistakes.

## Goals / Non-Goals

**Goals:**

- Every Blocking finding the operator reads has been checked against the frozen code by a second, stronger, independent reader.
- The skill describes what the operator experiences and names the helpers; it does not narrate how the harness repairs its own agents.
- The skill fits the Skills authoring budget.

**Non-Goals:**

- Changing what the general reviewer looks for, how lenses are selected, or how the review is published.
- Running the PR's code.
- Verifying Suggestions by default; the policy may opt in.

## Decisions

### 1. A dedicated verifier agent on opus, not a reviewer focus mode

`agents/pr-review-verifier.md` is a new read-only agent (`Read`, `Glob`, `Grep`; `model: opus`; under 600 words). Input: the inline JSON, the diff path, the frozen worktree, the reviewed identity. Output: per finding `confirmed` with a `file:line` citation and one sentence of evidence, or `unconfirmed` with the reason, plus the echoed identity.

A `Focus: verify` mode on the existing `reviewer` agent was rejected because model tier is per agent file and the value of the step is the stronger, independent reader. Reusing `inline-reviewer` was rejected because its package shape and lens vocabulary belong to `/th:verify`.

### 2. Demote, never delete silently

An unconfirmed Blocking becomes a Suggestion whose body starts with `(unverified)`, so the author still sees the concern with its confidence stated. A Blocking the verifier shows to be false — the cited behavior does not exist at the reviewed identity — is dropped and appears in the consolidation ledger as `dropped: verifier — <reason>`. The reviewer-consolidator's existing ledger gains this source; when only the general reviewer ran, the coordinator writes the ledger from the verifier return.

Dropping every unconfirmed finding was rejected: absence of confirmation is not proof of absence. Publishing unconfirmed blockers unchanged was rejected: that is the current state.

### 3. Verification recorded on the coverage line

`Lenses: reviewer ran, verified 3/4, security ran`. The count is coordinator-owned mechanical metadata. A verifier that fails to return is `verified 0/n (verifier absent)` and forces `COMMENT`, the same rule as any absent selected lens.

### 4. Policy sets the bar

`.team-harness/review-policy.md` may carry a fenced `yaml` block with `verification: blocking-only | all | off` and `max_suggestions: <n>`. Defaults are `blocking-only` and `5`. `off` is honored and stated on the coverage line as `verification off (policy)`; it is the repository owner's call, visible in the published review.

### 5. Boundary-only path rule, no repair path

The requirement keeps the two sentences that protect an asset: reviewers read only supplied coordinates and worktree leaves proven to exist inside the frozen worktree; deleted paths are read from the diff. Everything after that — mistake classification, packet rebuild, single retry, `continue-comment` — is removed. A return that omits a required field, echoes a different identity, or reports an unreadable supplied artifact is `absent ({reason})` and forces `COMMENT`. Identity, integrity, and freshness failures still fail closed.

`classify-agent-failure` is deleted from `review_context.py` with its tests. The helper's remaining subcommands (`prepare-run`, `compare`, `same-author`, `select-security`, `resume-run`, `cleanup-run`) are unchanged.

### 6. Skill under 500 lines

The mechanical steps that remain in prose — five-level helper resolution, snapshot-lifecycle warnings, Codex TOML marker checks — move into one `preflight` subcommand the skill names once. The skill keeps the operator-facing flow: gather, select, verify, preview, publish.

## Risks / Trade-offs

- **Verifier cost on every review** → one opus dispatch reading only the cited lines and their neighborhood; bounded by `max_suggestions` and the blocker count. The operator time it saves is the point.
- **Verifier disagrees with a true finding** → the finding survives as `(unverified)` Suggestion; the author still sees it. The ledger makes the disagreement auditable.
- **Removing the repair path surfaces more `COMMENT` reviews** → correct: a review with an absent lens is not an approval, and the frequency becomes visible where retries hid it.
- **Policy `off` removes the safeguard** → stated on the published coverage line; a repository that turns it off says so to every reader.
