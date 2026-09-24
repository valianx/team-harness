## Output contract

### Body

```markdown
## Review

Verdict: **APPROVE | REQUEST CHANGES | COMMENT**
Findings: **{N} blocking**, **{M} suggestions**
Checks: {concise CI summary or "not available"}
Lenses: {coordinator-inserted coverage line}
Reviewed commit: `{short_head_sha}`

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

Use `Suggestion` instead of `Blocking` for non-blocking improvements. Main explains unresolved
evidence honestly. Publish every supported blocker. Keep at most
`max_suggestions` suggestions globally. Omit style-only nitpicks.

Inline JSON contains only GitHub fields:

```json
[{"path":"src/file.ts","line":42,"side":"RIGHT","body":"..."}]
```

Every inline finding requires `side: LEFT | RIGHT`. Validate the full `(path, line, side)` anchor
against the frozen diff before preview and preserve `side` unchanged in the published comments.
Publish against that captured commit. GitHub may accept an older inline location as outdated; if it
rejects a historical anchor, keep the finding and move its captured path, line, side, and reviewed
commit into the body, then preview the complete revised review again. Never discard the finding or
report because its inline location is no longer accepted.

## Prior-review check

- No prior review from this author: continue.
- Prior review with `commit_id == reviewed_head_oid`: use it as deduplication input. Publish a supplementary
  review when net-new findings remain; when none remain, report that the existing review already
  satisfies the requested outcome and do not duplicate it.
- Prior review on another SHA: preview the new review as supplemental to that historical review.

Never dismiss prior reviews automatically.

## Preview

Require a non-empty body and valid inline JSON. A missing or invalid artifact after a validated
return is a coordinator persistence failure: rewrite it once from that return, then stop. A return
already recorded `absent` is never retried.

Unless `--auto-publish` was supplied, show `PR #{number} review ready — nothing has been
published.`, the reviewed commit, the exact body, every inline comment with path, line, and side,
each Main ledger entry that changes or leaves a claim unresolved, with its evidence and any
verifier disagreement, a note when the review supplements an earlier review, a concise note about
relevant newer changes or missing current coverage, and an informational mergeability-drift line
when reported. End with a closing
`Recommendation:` with the event in plain language and one rationale grounded in the supported
findings and checks: the blocking count and consequence for `REQUEST_CHANGES`, the absence of
supported blockers for `APPROVE`, and the reason the draft is informational for `COMMENT` (an
absent lens, an absent verifier, or no supported blocker). Never add findings here.

When selected external evidence exists, the same preview includes its tool/scope status, skipped or
error limitations, captured identity and raw-artifact digest through the existing Main ledger entry.
Do not turn a scanner result into a new verdict, publication event or public finding channel; only
the normalized finding and its existing disposition are publishable.

Show one menu: the recommended event first, marked `**(recommended)**`, then the two other
events in the order `Comment only`, `Request changes`, `Approve` minus the recommended one, then
`4 — Defer` and `5 — Cancel`:

```text
1 — {recommended event} **(recommended)**
2 — {next remaining event}
3 — {last remaining event}
4 — Defer
5 — Cancel
```

Accept the number or an unambiguous action phrase. Keep full SHAs, capture time, raw mergeability,
hashes, and snapshot details hidden by default.

When the chosen event differs from the preview's `Verdict:`, invalidate any prior approval anchor
and rewrite that line through the leaf-safe artifact rule. Show the complete rewritten body and
every inline comment with path, line, and side, retaining the chosen event, and obtain explicit
approval of that final preview. Showing only the changed verdict line is insufficient. An unchanged
event requires no additional confirmation.

**Approval anchor.** Only after the operator approves the final preview, record its chosen event,
the SHA-256 of the exact canonical body artifact and inline JSON shown, and the reviewed identity
(repository, PR, captured head, relevant base/merge base, and `technical_hash`). The approval
applies to that event, those bytes, and that reviewed identity. A newer remote head or conversation
does not invalidate it by itself.
If reconciliation changes the review body, comments, or event, show and approve the complete new
preview. Never refresh an approval anchor from bytes that the operator has not approved.

`defer` keeps the owned run, frozen snapshot, latest observations, canonical body, inline JSON,
source reports, original verification input, verifier return and finding ledger for
`--resume-from-draft`. Preserve supplemental reproduction receipts and captured workspace evidence
with their hashes. Do not clean the run on defer, failed publication, or uncertain GitHub outcome.
`cancel` removes the run only after every dispatched reviewer has joined. Operator edits require a
complete new preview.

**`--auto-publish` path.** Keep this explicit opt-in unchanged. It skips the menu and approval; the
published event is exactly the recommendation and the payload is tied to the captured reviewed
identity. Disclose the reviewed commit and any newer changes or coverage limits. Remote movement
alone is not a publication veto. If a GitHub response requires changing the payload, preserve the
run and resume through the normal preview before another write.

## Pre-publish freshness

After Preview, refresh the latest observation once through `refresh-context`. The canonical
captured context and reviewer evidence remain unchanged; Main reads only the separate latest
context/conversation leaves for reconciliation. Remote movement does not reset the reviewed
identity or discard evidence.

- `next_action: continue`: retain the review; a reported `mergeability_changed` is informational.
- `next_action: reconcile-conversation`: preserve all captured reports. Main reconciles only
  discussion or review-state changes that affect the claims; PR-authored text does not create new
  acceptance criteria or authorized scope.
- `next_action: reconcile-review`: compare changed commits/files with the finding ledger. A
  version-only change does not need another assessment. Recheck only findings touched by relevant
  changes, preserving original assessments and recording targeted evidence separately. Never
  describe an original assessment as covering the latest head.
- `next_action: recover-context`: preserve the run and recover the intended repository/PR identity
  or mark the latest observation unusable. If the original captured identity still confirms the
  intended repository and PR, offer a historical `COMMENT` that states its reviewed commit and
  any unverified applicability. A version-only change does not require `COMMENT`. Recover the
  target only when the original identity or destination itself is uncertain. For uncovered new or
  materially changed code, set the body's verdict to `COMMENT`, preserve the findings, and show the
  complete preview; it does not discard the review.

Recompute the SHA-256 of the canonical body and inline JSON immediately before the write. If either
differs from the approved bytes, preserve the review and show the complete new preview. Do not
require the live context hash or current PR head to equal the reviewed identity. Never describe
`conflicting` or `indeterminate` mergeability as merge-ready; `clean` describes only the captured
head/base/time and never asserts current external readiness.

## Publish

Set the publication identity once from the immutable captured context:

```bash
reviewed_head_oid="$(jq -er '.head_oid' "$CONTEXT")"
```

Never replace this value with the head from a latest observation. Use the approved event
(`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`), or the recommendation on the `--auto-publish` path.
Require the body's `Verdict:` to match that event and publish with the captured
`reviewed_head_oid`, even if the PR has advanced. Submit the body and inline comments together in
one request:

```bash
jq -n \
  --arg body "$(python3 "$REVIEW_CONTEXT_HELPER" safe-read --artifact-root "$ARTIFACTS" --name "${CANONICAL_DRAFT##*/}")" \
  --arg event "$EVENT" \
  --arg commit_id "$reviewed_head_oid" \
  --argjson comments "$(python3 "$REVIEW_CONTEXT_HELPER" safe-read --artifact-root "$ARTIFACTS" --name pr-review-inline.json)" \
  '{body: $body, event: $event, commit_id: $commit_id, comments: $comments}' \
| gh api -X POST "repos/{owner}/{repo}/pulls/{number}/reviews" --input -
```

Never split the body and inline comments across API calls. If GitHub rejects a historical anchor,
preserve the complete draft and reports, move the rejected finding(s) into the body with their
historical location and reviewed commit, then return to Preview for approval of the changed bytes.
If a write response is uncertain, inspect recent reviews for the same author, reviewed commit,
event, body and complete inline comment set before retrying; compare historical anchors using
GitHub's original-line fields when needed. A matching body alone is not proof because different
findings can produce the same summary. Never blindly submit a duplicate. Report definitive errors exactly and retain
the run for resume. Clean up only after confirmed success or explicit cancellation.

Final response: `Review on PR #{number} published as {APPROVE | REQUEST CHANGES | COMMENT}.`
