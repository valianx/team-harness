---
name: gcp-infra
description: Manage GCP infrastructure via a gated create → validate → apply flow (read-and-plan by default).
---

Manage a GCP infrastructure change: $ARGUMENTS

## Mode 1 — Read / Plan (default, SAFE)

Examples: `/th:gcp-infra "list compute instances in proj-x"`, `/th:gcp-infra --plan-only "show the IAM bindings on proj-x"`

Read-and-plan is the default. The agent inventories/describes the resources in scope and produces a plan report — no script is generated and no apply gate is presented.

1. Parse the input:
   - Positional free-form text: the description of what to inspect or change.
   - `--project <id>`: target GCP project. If omitted, the agent uses `gcloud config get project` and confirms.
   - `--plan-only`: read + plan only; never reach the apply gate. This is also the SAFE behavior even without the flag.

2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: gcp-infra
   - Intent: plan-only
   - Project: {project id, or "gcloud default"}
   - Change: {free-form description}
   - Feature: gcp-infra
   ```

## Mode 2 — Apply (gated)

Examples: `/th:gcp-infra --apply "resize web-1 to e2-medium in proj-x"`, `/th:gcp-infra --apply --project proj-x "delete unused disk old-data-1"`

`--apply` signals intent to proceed toward the apply gate. It does NOT auto-apply and it is NOT authorization — the operator STOP-block confirmation is the sole authorization path (and a destructive verb requires an extra explicit acknowledgement at that gate).

1. Parse the input:
   - Positional free-form text: the description of the desired change.
   - `--project <id>`: target GCP project (as above).
   - `--apply`: intent to reach the apply gate. Authorization still happens only at the STOP block.

2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: gcp-infra
   - Intent: apply
   - Project: {project id, or "gcloud default"}
   - Change: {free-form description}
   - Feature: gcp-infra
   ```

## Apply mode — review pipeline

When `--apply` is passed and the `gcp-infra` agent produces `02-apply.sh`, the orchestrator runs an independent review stage before presenting the operator gate:

1. `th:security` audits the script for secret exposure, ambient-project reliance, over-privileged IAM bindings, and CRITICAL RULES violations.
2. `th:qa` audits the script and `02-runbook.md` for idempotency, error-handling, and runbook completeness.

Both agents write findings to `02-gcp-review.md` (rated CRITICAL / WARNING / INFO). CRITICAL findings block the gate. The Phase 4 STOP block carries the review verdict so the operator sees it before approving.

## Important

- Always invoke the `orchestrator` agent — do NOT invoke the `gcp-infra` agent directly
- The orchestrator will route to the `gcp-infra` agent and the review pipeline (Apply mode)
- `--apply` is intent only, NOT authorization — the STOP gate is the sole authorization path; destructive verbs require an extra explicit acknowledgement
- Read-and-plan is the default; the agent never mutates GCP without operator approval at the gate
- Outputs:
  - `workspaces/{feature-name}/02-gcp-infra.md` — plan/apply report (all modes)
  - `workspaces/{feature-name}/02-apply.sh` — generated gcloud script (change-intent requests only)
  - `workspaces/{feature-name}/02-runbook.md` — ordered steps + rollback (change-intent requests only)
  - `workspaces/{feature-name}/02-gcp-review.md` — QA/security audit verdict (Apply mode only)
- The flow + verb-classification contract is documented in `docs/gcp-infra.md`
- **Prerequisites:** user must have `gcloud` installed and authenticated (`gcloud auth login` / `gcloud auth application-default login`)
- **Required IAM roles:** a viewer role on the target project for read/plan; for an apply, the operator must hold the **write IAM role** for whatever they ask to change (e.g. `roles/compute.instanceAdmin.v1`, `roles/storage.admin`, `roles/cloudsql.admin`, `roles/resourcemanager.projectIamAdmin`). The agent does not grant or assume roles.
