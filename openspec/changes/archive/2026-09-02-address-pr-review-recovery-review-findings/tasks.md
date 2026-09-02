## 1. Reviewer Contract Corrections

- [x] 1.1 Update coordinator and reviewer semantic sources so deleted paths use captured diff evidence and every worktree content read requires a non-symlink regular file resolved inside the frozen worktree.
- [x] 1.2 Make workspace-directory validation conditional on a non-`none` supplied workspace coordinate.
- [x] 1.3 Require explicit reviewed-SHA, context-hash, snapshot-integrity, and freshness status arguments at the recovery-classifier CLI boundary.

## 2. Regression Coverage and Generated Artifacts

- [x] 2.1 Add focused tests for deleted-file routing, symlink containment instructions, workspace absence, and rejected classifier invocations with omitted status evidence.
- [x] 2.2 Regenerate canonical mirrors, Codex agent projections, packaged plugin/setup assets, and OpenCode review helper copies from their source inputs.
- [x] 2.3 Extend generation assertions so every distributed reviewer surface retains the tightened path and classifier contracts.

## 3. Validation

- [x] 3.1 Run strict OpenSpec validation and focused review-context tests.
- [x] 3.2 Run Codex generation freshness checks, generator tests, and relevant Team Harness lint/generation validation.
- [x] 3.3 Run the shared repository suite and confirm immutable-snapshot and publish-approval safety remain green.

## 4. Pull Request Disposition

- [x] 4.1 Record an evidence-backed `APPLIED` disposition for each valid CodeRabbit comment after its correction passes validation.
- [x] 4.2 Commit and push the corrective changes to PR #623 without including unrelated local OpenSpec changes.
- [x] 4.3 Preview the batched GitHub thread replies, then reply and resolve only the fully addressed threads after operator approval; verify final PR checks.
