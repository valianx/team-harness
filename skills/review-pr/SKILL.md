---
name: review-pr
description: Review a GitHub pull request against an immutable code and conversation snapshot, verify its blocking findings, preview a concise review, and publish it atomically after operator approval.
---

Analyze `$ARGUMENTS`. Accept a PR number (`45`, `#45`) or URL; remove options before parsing it.

## Options

- `--reviewers <focus[,focus]>`: request explicit lenses. `general` and `architecture`
  use reviewer passes; `security` selects the security specialist.
- `--multi`: shorthand for `--reviewers general,architecture`.
- `[TIER: N]`: compatibility override. Tier 4 forces the security specialist; other values do not add reviewers.
- `--resume-from-draft`: publish a saved draft only after snapshot validation.
- `--auto-publish`: operator opt-in to skip the preview menu.
- `--converge`: compatibility alias for `--multi`; one set of independent passes, never a loop.

## Non-negotiable invariants

1. Invoke `orchestrator` for every agent dispatch. Agents run no Bash.
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
`pr-review-security` (permissions, input validation, trust boundaries), `reviewer-consolidator`
(one final draft when several results exist), and `pr-review-verifier` (confirmation of every
blocking finding against the frozen code, unless the repository policy turns verification off).
Do not call agents abstract "lenses" in operator-facing prose.

Never emit a message whose only content is tool-status narration. During an extended wait, name
the active specialists and the surfaces they inspect. Expose SHAs or the context hash only when
identity drift blocks the review or the operator asks. If `preflight` reports
`workspaces_ignore: added`, report that material `.gitignore` change once.

## Resume

Resolve exactly one complete isolated run with `review_context.py resume-run` (context, non-empty
body draft, and inline JSON), capture a fresh context, and run `review_context.py compare`.
`continue` resumes at Preview; `reconcile-conversation` refreshes the conversation, reruns
same-author/prior-review detection, reconciles the draft once, and returns to Preview without
rerunning specialists; `restart-technical-review` discards the draft and restarts at Gather. A
capture failure or missing snapshot identity stops; never publish a stale draft.

## Gather

### 1. Resolve the helper and run preflight

Resolve `{owner}/{repo}` from the URL or `gh repo view`. Resolve the bundled helper, in order:

1. latest `~/.claude/plugins/cache/team-harness-marketplace/th/*/skills/review-pr/scripts/review_context.py`
2. `~/.claude/skills/review-pr/scripts/review_context.py`
3. the opencode skill install:
   `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/skills/review-pr/scripts/review_context.py`
   (Windows: `%APPDATA%\opencode\skills\review-pr\scripts\review_context.py`; a project-scope
   install uses `<repo>/.opencode/skills/review-pr/scripts/review_context.py`)
4. `scripts/review_context.py` resolved against this skill's own directory — the packaged copy on
   Codex and opencode installs
5. `./skills/review-pr/scripts/review_context.py`

Do not recreate the helper inline; then run the prerequisite check once:

```bash
REVIEW_ROOT="$(git rev-parse --show-toplevel)"
python3 "$REVIEW_CONTEXT_HELPER" preflight --repo-root "$REVIEW_ROOT" --runtime {claude|codex|opencode}
```

`preflight` verifies `gh` authentication, ensures the repository `.gitignore` carries an anchored
`/workspaces/` entry, and on Codex requires one complete project agent set: every one of the five
review agents present as a regular Team Harness-generated read-only TOML. It returns `ok` with a
`blockers` list. On a blocker, stop with:

```text
cannot capture a trustworthy PR snapshot — authenticate gh or paste the diff and conversation
```

For a Codex agent-set blocker, direct the operator to `$team-harness:setup agents` or
`$team-harness:update`, then require a new Codex thread so newly installed agent declarations are
discovered. Never inherit a general agent's authority for a review role.

### 2. Prepare the isolated review run

```bash
RUN_META="$(python3 "$REVIEW_CONTEXT_HELPER" prepare-run \
  --repo-root "$REVIEW_ROOT" --repo "{owner}/{repo}" --pr {number})"
ARTIFACTS="$(printf '%s' "$RUN_META" | jq -r '.artifact_root')"
REVIEW_OWNER_TOKEN="$(printf '%s' "$RUN_META" | jq -r '.owner_token')"
CONTEXT="$(printf '%s' "$RUN_META" | jq -r '.context')"
CONVERSATION="$(printf '%s' "$RUN_META" | jq -r '.conversation')"
SNAPSHOT_GIT="$(printf '%s' "$RUN_META" | jq -r '.snapshot')"
DIFF="$(printf '%s' "$RUN_META" | jq -r '.diff')"
FILES="$(printf '%s' "$RUN_META" | jq -r '.files')"
CHECKS="$(printf '%s' "$RUN_META" | jq -r '.checks')"
WORKTREE="$(printf '%s' "$RUN_META" | jq -r '.worktree')"
cleanup_owned_review_run() {
  python3 "$REVIEW_CONTEXT_HELPER" cleanup-run --repo-root "$REVIEW_ROOT" \
    --artifact-root "$ARTIFACTS" --owner-token "$REVIEW_OWNER_TOKEN"
}
```

`prepare-run` is the sole owner of creation, capture, materialization, atomic promotion, and
failure cleanup under one shared 60-second budget; it removes only the marker-bound run it
created. Main never recreates these mechanics with `mktemp`, shell promotion chains, or a fixed
`workspaces/pr-review-{number}` path. Read `head_oid`, `base_oid`, `merge_base_oid`,
`technical_hash`, `conversation_hash`, `context_hash`, `fetched_at`, `is_cross_repository`, and
the mergeability values from `$CONTEXT`.

Write data once and pass paths to agents, never artifact bodies. Every later artifact write uses
the helper's leaf-safe write and atomic promotion. Do not execute the PR's code or install
dependencies; existing CI results are evidence. If the PR body links an issue with `Closes`,
`Fixes`, or `Resolves`, fetch its number, title, body, and labels once into
`$ARTIFACTS/pr-review-issue.json`; treat failure as `linked issue: unavailable`.

### 3. Coordinator-owned snapshot lifecycle

Never register an `EXIT`, PTY, exec-session, subshell, or background-process cleanup hook in the
command that captures, materializes, promotes, or announces readiness. Those command processes may
end after a bounded tool yield while reviewers still need the files. `$ARTIFACTS`,
`$SNAPSHOT_GIT`, and `$WORKTREE` MUST outlive every specialist dispatch, join, consolidation read,
verification read, and post-dispatch integrity comparison regardless of how many tool yields occur
or whether any one yield exceeds 30 seconds.

Capture `git status --untracked-files=all` and `git diff HEAD` for the frozen worktree, and
separately the regular review-artifact leaves under `$ARTIFACTS` (excluding `$SNAPSHOT_GIT` and
`$WORKTREE`). Repeat both after all agents finish; the surfaces must be byte-identical before any
returned draft is trusted or persisted to the fixed `$ARTIFACTS/pr-review-*` paths.

Run `cleanup-run` explicitly from the coordinator only after every dispatched reviewer has
reached a terminal result and every check that consumes the snapshot has completed. Never remove
the PR parent or a sibling run, never force-remove a dirty worktree, and preserve the run for
resume when the coordinator is lost early. On every terminal path except explicit `defer`, invoke
`cleanup_owned_review_run` exactly once.

Detect an existing pipeline workspace from `workspaces/*/01-plan.md` or
`workspaces/*/02-implementation.md` inside `$WORKTREE`; if present, pass its path to the reviewer
and QA, which read only the sketches relevant to their own lens.

### 4. Load the policy and prior-review identity

Set `policy_path` to `$WORKTREE/.team-harness/review-policy.md` when present; otherwise `none`.
Do not paste its contents into Task prompts. Read the verification bar once from the base commit,
never from the reviewed head, so a pull request cannot set the bar for its own review:

```bash
python3 "$REVIEW_CONTEXT_HELPER" policy --snapshot-git "$SNAPSHOT_GIT" --base-oid "$base_oid"
```

It returns `verification` (`blocking-only` default, `all`, or `off`) and `max_suggestions`
(default `5`). An invalid policy stops the review with the helper's message.

Resolve the authenticated login and run:

```bash
python3 "$REVIEW_CONTEXT_HELPER" same-author \
  --context "$CONTEXT" --login "$(gh api user --jq '.login')"
```

Keep the returned review, if any, for duplicate detection.

## Select lenses

The default is one `general` reviewer. PR size alone never adds reviewers.

Run the local selector before adding specialist agents:

```bash
python3 "$REVIEW_CONTEXT_HELPER" select-security \
  --changed-files "$FILES" --diff "$DIFF" \
  {--explicit-security when requested} {--tier 4 when supplied}
```

The selector returns `security_required` with its `reason` and triggers: required for
`known-sensitive`, `unmatched-executable`, an explicit request, or Tier 4; omitted for
`known-non-executable` and `indeterminate`. A missing selector or unreadable artifact fails closed
and requires security. State the `reason` whenever security is omitted.

Add specialists only from concrete signals: **QA** when a pipeline workspace with acceptance
criteria exists and the diff changes executable behavior; **security** when the selector requires
it; **focused reviewer passes** (`general`/`architecture`) only when requested through
`--reviewers`/`--multi`. A large PR remains one general pass. The general reviewer owns
correctness, contracts, and regressions; QA owns acceptance evidence; security owns trust
boundaries. Announce the selected specialists, `reviewer-consolidator` when several results will
exist, and `pr-review-verifier` unless `verification` is `off`.

## Pre-dispatch freshness

Immediately before dispatch, refresh through the owned-run helper:

```bash
python3 "$REVIEW_CONTEXT_HELPER" refresh-context \
  --repo-root "$REVIEW_ROOT" --repo "{owner}/{repo}" --pr {number} \
  --artifact-root "$ARTIFACTS" --owner-token "$REVIEW_OWNER_TOKEN"
```

- `next_action: continue`: dispatch; a reported `mergeability_changed` is one informational line.
- `next_action: reconcile-conversation`: only `$CONTEXT` and `$CONVERSATION` were refreshed;
  rerun same-author/prior-review detection, then dispatch once.
- `next_action: restart-technical-review`: code or semantic scope drift; rebuild artifacts and
  restart Gather once. A second movement is an external freshness failure to report.

## Dispatch

The five PR agents are `reviewer`, `pr-review-qa`, `pr-review-security`, `pr-review-verifier`, and
`reviewer-consolidator`. Their source manifests and projections are deny-by-default and read-only;
`preflight` has already confirmed the runtime exposes them.

Pass coordinates and artifact paths, not artifact bodies. The `reviewer` packet is a
`Direct Mode Task` with `Mode: review`, `Focus`, `PR`, `Repository`, `Base`, `Head`,
`Reviewed Head SHA`, `Base SHA`, `Merge Base SHA`, `Technical Hash`, `Conversation Hash`,
`Context Hash`, `Mergeability` with both raw GitHub values, `Worktree`, `Review Artifacts Root`,
`Context Path`, `Conversation Path`, `Diff Path`, `Changed Files Path`, `Checks Path`,
`Policy Path`, `Workspace Path`, and `Linked Issue Path` (each `none` when absent), plus
`Draft Output: $ARTIFACTS/pr-review-draft{suffix}.md` and
`Inline Output: $ARTIFACTS/pr-review-inline{suffix}.json`.

For explicit general/architecture passes, change `Focus` and use a focus suffix. Dispatch
independent passes in parallel. Never dispatch both a security-focused reviewer and the security
specialist for the same review.

When selected, dispatch QA and `pr-review-security` in parallel with only their required
coordinates: `Mode`, `PR`, `Reviewed Head SHA`, `Technical Hash`, `Context Hash`, `Worktree`,
`Workspace Path`, `Context Path`, `Diff Path`, and `Changed Files Path`.

### Read boundary and absent returns

Every non-`none` coordinate in a dispatch is required; before dispatch, verify each is a regular
non-symlink leaf inside `$ARTIFACTS` or `$WORKTREE`. Reviewers read only supplied coordinates and
project leaves proven to exist as regular files inside the frozen worktree; a deleted changed-file
path is evidence from `Diff Path` only, and source markers are never read coordinates. Every lens
returns its draft inline with the exact reviewed SHA, technical hash, and context hash. Validate
each return once:

- A return that omits a required field, echoes a different identity, or reports a supplied
  artifact as unreadable is recorded `absent ({reason})` on the coverage line and forces
  `COMMENT`. Do not rebuild the packet, classify the mistake, or dispatch a correction.
- A mismatched reviewed SHA or technical hash, a non-identical post-dispatch snapshot, or a failed
  freshness comparison is an integrity failure: fail closed without preview or publication.
- A stale context hash with the same technical hash is conversation drift and follows the
  reconciliation path below.
- An absent general reviewer or a consolidation that leaves no trustworthy canonical draft fails
  closed with the violated rule reported; never fabricate findings or drop an unaccounted blocker.

After validating the returned SHA and technical hash, the coordinator alone persists returns using
this fixed mapping: reviewer body → `$ARTIFACTS/pr-review-draft.md`, reviewer findings →
`$ARTIFACTS/pr-review-draft-inline.json`, QA → `$ARTIFACTS/pr-review-qa.md`, security →
`$ARTIFACTS/pr-review-security.md`, consolidator body → `$ARTIFACTS/pr-review-final.md`,
consolidator findings → `$ARTIFACTS/pr-review-inline.json`, verifier →
`$ARTIFACTS/pr-review-verifier.json`. Ignore any output path proposed by an agent.

### Post-dispatch conversation reconciliation

After every selected technical specialist joins and its return is identity-validated, run
`refresh-context` once more. `continue` uses the results; `restart-technical-review` discards them
and restarts Gather once; `reconcile-conversation` preserves every result whose `technical_hash`
matches, reruns same-author/prior-review detection, and performs exactly one reconciliation —
`reviewer` in `reconcile-conversation` mode when only the general draft exists, otherwise one
`reviewer-consolidator` dispatch with the drafts plus the fresh context and conversation — whose
return echoes the unchanged `technical_hash` and the fresh `context_hash`. A
`technical_recheck_required` naming `general` or `security` with an exact cited locus dispatches
only that specialist once against the unchanged snapshot, then reconciles once more.

### Canonical draft

If only the general reviewer ran, its body and inline JSON are canonical. If any additional draft
exists, dispatch `reviewer-consolidator` once with the source file paths, `head_oid`,
`technical_hash`, `context_hash`, the current conversation path, and the read-only `Worktree`
coordinate. It produces `$ARTIFACTS/pr-review-final.md` and `$ARTIFACTS/pr-review-inline.json`.
There is no automatic convergence loop.

The consolidator's return enumerates, per source lens, findings received and their disposition
(`preserved`, `demoted`, `dropped`) with a one-line reason. Before verification, confirm every
blocking finding present in a source draft appears in the consolidated output or in that ledger.
On a mismatch, retry the consolidator once with the discrepancy named; if it still fails, preserve
the validated general draft and every validated specialist blocker as explicit cross-file findings
and produce a conservative `REQUEST_CHANGES` or `COMMENT` draft. A missing or count-inconsistent
ledger is never a silent pass-through.

## Verify

Skip this step only when `verification` is `off`. Otherwise dispatch one `pr-review-verifier`
against the canonical inline JSON:

```text
Mode: pr-review-verifier
PR: #{number}
Reviewed Head SHA: {head_oid}
Technical Hash: {technical_hash}
Context Hash: {context_hash}
Worktree: {WORKTREE}
Diff Path: {DIFF}
Inline Findings Path: {canonical inline JSON path}
Verification: {blocking-only | all}
```

The verifier returns one status per selected finding — `confirmed` with a `file:line` citation,
`unconfirmed` with the reason, or `refuted` with the evidence — and never adds findings. Validate
its identity echo like any other return, persist it, then apply it mechanically:

```bash
python3 "$REVIEW_CONTEXT_HELPER" apply-verification \
  --artifact-root "$ARTIFACTS" --inline-name {canonical inline leaf} \
  --verifier-name {pr-review-verifier.json | none} \
  --verification {blocking-only | all} --output-name pr-review-inline.json
```

The helper demotes each unconfirmed blocker to a Suggestion whose body begins with
`(unverified)`, drops each refuted blocker into the ledger as `dropped: verifier — <reason>`,
leaves confirmed and unselected findings unchanged, and returns the coverage fragment
(`verified k/n`). Pass `--verifier-name none` when the verifier returned nothing valid: the
findings are untouched, the fragment reads `verified 0/n (verifier absent)`, and the
recommendation is forced to `COMMENT`. Append the verifier's ledger entries to the consolidation
ledger (or write the ledger from them) and update the body's `Findings:` counts.

**Coverage line.** Compose one line under `Checks:` from each selected lens outcome — `ran`,
`limited ({reason})`, or `absent ({reason})` — plus the verification fragment:

```bash
python3 "$REVIEW_CONTEXT_HELPER" lenses-line --lens "reviewer ran" {--lens "qa limited (no operator oracle)"} \
  --verification "{verified k/n | verified 0/n (verifier absent) | verification off (policy)}"
```

This line is coordinator-owned mechanical metadata; agents never write it. An absent selected lens
or an absent verifier appears here and forces `COMMENT`, so a published APPROVE can never hide a
lens or a verification that did not run.

While agents run, keep raw dispatch coordinates and identity validation silent. If a progress
update is warranted, name the active agents and their distinct responsibilities against the
concrete changed surfaces; never relay raw agent status blocks or waiting-tool output.

## Output contract

The canonical GitHub review has two surfaces.

### Body

```markdown
## Review

Verdict: **APPROVE | REQUEST CHANGES | COMMENT**
Findings: **{N} blocking**, **{M} suggestions**
Checks: {concise CI summary or "not available"}
Lenses: {coordinator-inserted coverage line}

{Only cross-file findings that cannot be anchored to one changed line. Omit when empty.}
```

No reviewability scores, estimated time, file counts, per-agent sections, repeated inline
findings, praise, or out-of-scope observations. Target at most 80 lines and 900 words; when
cross-file blockers need more, remove optional prose and never truncate a blocker.

### Inline threads

One comment per actionable, line-anchored finding:

```markdown
**Blocking: {claim}**

{Evidence and consequence in at most three short sentences.}

**Fix:** {concrete correction in at most two short sentences.}
```

Use `Suggestion` instead of `Blocking` for non-blocking improvements; a demoted finding reads
`**Suggestion: (unverified) {claim}**`. Publish every supported blocker. Keep at most
`max_suggestions` suggestions globally. Omit style-only nitpicks.

Inline JSON contains only GitHub fields:

```json
[{"path":"src/file.ts","line":42,"side":"RIGHT","body":"..."}]
```

Every inline finding requires `side: LEFT | RIGHT`. Validate the full `(path, line, side)` anchor
against the frozen diff before preview and preserve `side` unchanged in the published comments.

## Prior-review check

- No prior review from this author: continue.
- Prior review with `commit_id == head_oid`: use it as deduplication input. Publish a supplementary
  review when net-new findings remain; when none remain, report that the existing review already
  satisfies the requested outcome and do not duplicate it.
- Prior review on another SHA: preview the new review as superseding that historical review.

Never dismiss prior reviews automatically.

## Preview

Require a non-empty body and valid inline JSON. Retry the producing agent once for a missing or
invalid artifact; then stop.

Unless `--auto-publish` was supplied, show `PR #{number} review ready — nothing has been
published.`, the exact body, every inline comment with path, line, and side, each verifier ledger
entry (`dropped` and `demoted` claims with the verifier's reason), a superseded-review note when
applicable, an informational mergeability-drift line when reported, and a closing
`Recommendation:` with the event in plain language and one rationale grounded in the supported
findings and checks: the blocking count and consequence for `REQUEST_CHANGES`, the absence of
supported blockers for `APPROVE`, and the reason the draft is informational for `COMMENT` (an
absent lens, an absent verifier, or no supported blocker). Never add findings here.

**Approval anchor.** When the operator approves, record the SHA-256 of the exact canonical body
artifact and inline JSON shown in the preview. The approval applies to those bytes and the
displayed `context_hash` only.

Show one menu: the recommended event first, marked `**(recommended)**`, then the two other
events in the order `Comment only`, `Request changes`, `Approve` minus the recommended one, then
`4 — Defer` and `5 — Cancel`:

```text
1 — Request changes **(recommended)**
2 — Comment only
3 — Approve
4 — Defer
5 — Cancel
```

Accept the number or an unambiguous action phrase. Keep SHAs, capture time, raw mergeability,
context hash, and snapshot details hidden by default.

`defer` copies the canonical body to `$ARTIFACTS/pr-review-final.md`, preserves that file, inline
JSON, and context for `--resume-from-draft`, then explicitly removes the worktree and nonessential
artifacts after every reviewer has joined. `cancel` explicitly removes all artifacts at the same
terminal boundary. Operator edits require another complete preview.

**`--auto-publish` path.** No menu and no approval: the published event is exactly the
recommendation, the anchor is taken from the canonical draft at validation time, and the same
freshness rules below apply without prompting. A capture failure, moving target, or anchor
mismatch prevents publication.

## Pre-publish freshness

After approval and immediately before the GitHub write, run `refresh-context` again against the
approved capture.

- `next_action: continue`: write; a reported `mergeability_changed` is one informational line.
- `next_action: restart-technical-review`: invalidate approval and restart Gather once; a second
  one after that restart stops and keeps the draft for a manual retry.
- `next_action: reconcile-conversation`: invalidate only the approval, run the single
  conversation reconciliation, and re-preview without rerunning specialists or the verifier.
- Capture or comparison failure: invalidate approval and restart Gather with
  `freshness could not be verified — review not published`.

Recompute the SHA-256 of the canonical body and inline JSON immediately before the write and
require equality with the approval anchor; a mismatch fails closed and re-previews. Never describe
`conflicting` or `indeterminate` mergeability as merge-ready; `clean` describes only the captured
head/base/time and never asserts current external readiness.

## Publish

Map the operator's choice to `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`. When the chosen event
differs from the recommendation, rewrite the body's `Verdict:` line to the chosen event through
the leaf-safe artifact rule, refresh the approval anchor to the rewritten bytes, and show the
updated verdict line before the write — the published body and event must never disagree. Submit
exactly once:

```bash
jq -n \
  --arg body "$(python3 "$REVIEW_CONTEXT_HELPER" safe-read --artifact-root "$ARTIFACTS" --name "${CANONICAL_DRAFT##*/}")" \
  --arg event "$EVENT" \
  --arg commit_id "$head_oid" \
  --argjson comments "$(python3 "$REVIEW_CONTEXT_HELPER" safe-read --artifact-root "$ARTIFACTS" --name pr-review-inline.json)" \
  '{body: $body, event: $event, commit_id: $commit_id, comments: $comments}' \
| gh api -X POST "repos/{owner}/{repo}/pulls/{number}/reviews" --input -
```

Never split the body and inline comments across API calls. Report the exact error on failure and
run the coordinator-owned cleanup on every terminal path.

Final response: `Review on PR #{number} published as {APPROVE | REQUEST CHANGES | COMMENT}.`

## No input

Ask for a PR number or URL and stop.
