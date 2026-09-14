## Output contract

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

Use `Suggestion` instead of `Blocking` for non-blocking improvements. Main explains unresolved
evidence honestly. Publish every supported blocker. Keep at most
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

Require a non-empty body and valid inline JSON. A missing or invalid artifact after a validated
return is a coordinator persistence failure: rewrite it once from that return, then stop. A return
already recorded `absent` is never retried.

Unless `--auto-publish` was supplied, show `PR #{number} review ready — nothing has been
published.`, the exact body, every inline comment with path, line, and side, each Main ledger
entry that changes or leaves a claim unresolved, with its evidence and any verifier disagreement, a superseded-review note when
applicable, an informational mergeability-drift line when reported, and a closing
`Recommendation:` with the event in plain language and one rationale grounded in the supported
findings and checks: the blocking count and consequence for `REQUEST_CHANGES`, the absence of
supported blockers for `APPROVE`, and the reason the draft is informational for `COMMENT` (an
absent lens, an absent verifier, or no supported blocker). Never add findings here.

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

Accept the number or an unambiguous action phrase. Keep SHAs, capture time, raw mergeability,
context hash, and snapshot details hidden by default.

When the chosen event differs from the preview's `Verdict:`, invalidate any prior approval anchor
and rewrite that line through the leaf-safe artifact rule. Show the complete rewritten body and
every inline comment with path, line, and side, retaining the chosen event, and obtain explicit
approval of that final preview. Showing only the changed verdict line is insufficient. An unchanged
event requires no additional confirmation.

**Approval anchor.** Only after the operator approves the final preview, record its chosen event
and the SHA-256 of the exact canonical body artifact and inline JSON shown. The approval applies
to that event, those bytes, and the captured `context_hash` only. Never refresh an approval anchor
from bytes that the operator has not approved.

`defer` copies the canonical body to `$ARTIFACTS/pr-review-final.md`, preserves that file, inline
JSON, context, source reports, original verification input, persisted verifier return (including
its identity) and Main's finding ledger for `--resume-from-draft`. Preserve supplemental
reproduction receipts and their required captured objects when present, and any captured workspace
manifest and its listed leaves with the ledger's hashes. Only then remove the worktree and
genuinely nonessential artifacts after every reviewer has joined. `cancel` explicitly removes all
artifacts at the same terminal boundary. Operator edits require another complete preview.

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
  conversation reconciliation and re-preview. Reuse persisted verifier assessments only for
  unchanged claims with the same frozen technical identity; do not overwrite Main's dispositions
  with the original verification input. New or materially changed claims receive one targeted
  verification, retaining unrelated completed assessments. Missing coverage forces `COMMENT`.
- Capture or comparison failure: invalidate approval and restart Gather with
  `freshness could not be verified — review not published`.

Recompute the SHA-256 of the canonical body and inline JSON immediately before the write and
require equality with the approval anchor; a mismatch fails closed and re-previews. Never describe
`conflicting` or `indeterminate` mergeability as merge-ready; `clean` describes only the captured
head/base/time and never asserts current external readiness.

## Publish

Use the approved event (`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`), or the recommendation on
the `--auto-publish` path. Require the body's `Verdict:` to match that event before the freshness
and approval-anchor checks; a mismatch returns to the complete preview (or stops without prompting
under `--auto-publish`) instead of rewriting approved bytes during publication. Submit exactly once:

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
