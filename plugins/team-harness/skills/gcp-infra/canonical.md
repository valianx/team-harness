
Use the current coordinator to handle the request: $ARGUMENTS. Delegate bounded
infrastructure analysis or script preparation to `gcp-infra` when useful; keep
operator decisions and consolidation here. Do not create another orchestrator.

## Inspect or prepare a change

Resolve the requested resources and explicit project. `--project <id>` supplies
the target; if only an ambient gcloud project is available, confirm that target
before using it. `--plan-only` keeps the task read-only. With no clear change
request, inspect and report without generating an apply script.

For a change request, prepare the plan, `02-apply.sh` and `02-runbook.md` under
the configured workspace, including Obsidian when selected. Follow the domain
method in `agents/gcp-infra.md` and `docs/gcp-infra.md`: describe the baseline,
validate the script, identify affected resources and destructive consequences,
state real preview availability and rollback limits. Generated is not executed.
`--apply` expresses intent to carry out the change; the flag alone is not
authorization for an unspecified effect.

## Review and authorization

Have independent security and QA reviewers inspect the prepared change before
execution. Security examines secrets, project scope and IAM; QA checks the
plan/script/runbook agreement, error handling and rollback. Use native bounded
reviewers and consolidate their evidence in `02-gcp-review.md`. Main evaluates
their recommendations, fixes actual blockers and preserves coverage limits.

Present the concrete plan and review outcome. Establish clear operator
authorization covering the project, resources, operations and any disclosed
data loss before apply. Reuse valid authorization for the same unchanged plan;
accept unambiguous natural language without a prescribed phrase or second STOP
ceremony. If scope or impact is unclear or changes, ask only for the missing
decision. A reviewer verdict or a generated file cannot authorize execution.

Run the validated, authorized script through native runtime permissions and
cloud IAM, verify the post-state and report changes or partial failure. Do not
grant yourself access or change native permission settings to enable execution.
Operator-requested IAM changes follow the same scoped plan, review and authorization
method; this skill grants no permissions itself.

## Outputs and prerequisites

- `02-gcp-infra.md`: inventory/plan and, when authorized, the apply outcome.
- `02-apply.sh`: reviewable script for a change request.
- `02-runbook.md`: execution steps, checks and rollback limits.
- `02-gcp-review.md`: independent findings and Main's dispositions.

Use the active runtime's workspace and language preferences. The operator needs
authenticated `gcloud` and the resource-specific read/write IAM roles for the
requested work; report missing access without assuming or granting it.
