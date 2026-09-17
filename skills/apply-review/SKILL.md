---
name: apply-review
description: Evaluate and resolve comments on an existing PR using the task context and focused validation.
---

The current general agent coordinates comment handling. Resolve the PR from
the request or active repository and branch; ask only when that context is
ambiguous. Read its current diff, review comments and relevant discussion.

Use [the shared evaluation guide](../../agents/_shared/apply-review-disposition.md)
to judge comments against the intended behavior. It is the author-side guide
for this skill, including comment handling during an existing delivery flow.
Reviewers provide evidence and recommendations; Main decides the response.

Apply worthwhile corrections and run checks appropriate to the changed
behavior. Keep any affected living specs and archived change consistent with
the implementation. Reuse valid review and test evidence.

Continue the user's authorized delivery on the existing PR, using `create-pr`
when updating its candidate. Reply to or resolve GitHub threads when the
request covers those actions, making remaining concerns and disagreements
clear. Merge only when requested and the repository's merge conditions are met.
Summarize what changed, what was verified and anything still pending.
