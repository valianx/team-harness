
Use this skill whenever the request or active workflow calls for PR preparation
or publication, without requiring the user to name it. For reviewing an existing
PR use `review-pr`; for author-side comments use `apply-review`. A merge-only
request follows the repository's merge workflow without preparing a new PR.
The current general agent coordinates and reuses the user's authorization.

## Prepare a reviewable candidate

Resolve the repository, branch, base, intended scope and current diff. Follow
the repository's PR and branch conventions. Preserve unrelated tracked and
untracked work and stage only the intended change.

Keep maintained tests, tools, fixtures, documentation and shipped generated
outputs. Exclude execution logs, scratch scripts, screenshots and temporary
review reports unless they are deliberately part of the product. Use the
configured workspace or temporary storage for work evidence.

Check relevant open OpenSpec changes against the implementation and validation.
Use [the lifecycle](../spec/references/lifecycle.md) to archive completed,
verified changes with their implementation in the same PR. Report unfinished or
conflicting work precisely; unrelated changes stay outside this PR.

Run appropriate repository checks and reuse evidence that remains applicable.
Use [author review](../spec/references/author-review.md) where it adds confidence.
Evaluate findings, apply worthwhile corrections and verify them. A historical
review label or missing TH gate record is not publication authority.

Write a concise title and body explaining the resulting behavior, why it changed
and how it was checked. Follow the repository template. Use issue-closing keywords
only when the candidate fully resolves those issues.

## Publish or resume

Confirm the final branch/base/head and scope before publication. If the candidate
changed, assess the actual difference and refresh affected evidence. Existing
authorization covers ordinary in-scope repairs; ask only for a genuinely missing
decision. Native runtime permissions continue to govern outward actions.

Resolve any configured GitHub identity route and use the intended account and
host. Check for an existing PR for the exact repository/head/base before creating
one. Preserve its current state unless the request changes it. For a merged or
closed prior PR, inspect branch history before choosing a new delivery branch.

With `gh`, use explicit `--repo`, `--head`, `--base` and a temporary
`--body-file` where supported. Prepare the body locally; `gh pr create
--dry-run` may push and is not a local preview. After an uncertain network
result, inspect the exact remote state before retrying. If push succeeded but PR
creation failed, resume the PR step rather than repeating completed work.

Return the PR URL and state, validation limitations, or the precise remaining
step. Continue CI monitoring, comment handling or merge when the user requested
those actions as part of the task.
