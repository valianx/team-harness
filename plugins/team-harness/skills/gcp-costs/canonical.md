
Analyze the input: $ARGUMENTS

Use the [workspace skill](../workspace/SKILL.md) to resolve or reuse the shared
absolute workspace before delegation. Pass that exact effort workspace and any
explicit deliverable target to the specialist.

---
name: gcp-costs

## Mode 1 — Full analysis (default)

Examples: `/th:gcp-costs`, `/th:gcp-costs all`, `/th:gcp-costs full`

1. Parse the input:
   - If no arguments or "all" or "full": full analysis across all accessible GCP projects

2. Give the Direct Mode Task to the current general agent/Main. Main coordinates the read-only `gcp-cost-analyzer` specialist directly using native delegation; do not invoke a nested orchestrator or add another mode gate.
   ```
   Direct Mode Task:
   - Mode: gcp-costs
   - Scope: full
   - Projects: all accessible
   - Feature: gcp-cost-analysis
   - Workspace path: {resolved shared workspace}
   - Deliverable target: {explicit target, or the resolved workspace}
   ```

## Mode 2 — Scoped analysis (specific projects or services)

Examples: `/th:gcp-costs project-abc project-xyz`, `/th:gcp-costs --service compute`, `/th:gcp-costs project-abc --service sql`

1. Parse the input:
   - Extract project IDs (plain words that look like project IDs)
   - Extract service filter if `--service` flag present (compute, sql, gke, storage, functions, run, network)

2. Give the Direct Mode Task to the current general agent/Main. Main coordinates the read-only `gcp-cost-analyzer` specialist directly using native delegation; do not invoke a nested orchestrator or add another mode gate.
   ```
   Direct Mode Task:
   - Mode: gcp-costs
   - Scope: scoped
   - Projects: {comma-separated project IDs, or "all" if only service filter}
   - Service filter: {service name, or "all" if only project filter}
   - Feature: gcp-cost-analysis
   - Workspace path: {resolved shared workspace}
   - Deliverable target: {explicit target, or the resolved workspace}
   ```

## Mode 3 — Quick scan (idle resources only)

Examples: `/th:gcp-costs --quick`, `/th:gcp-costs --quick project-abc`

1. Parse the input:
   - Detect `--quick` flag
   - Extract optional project IDs

2. Give the Direct Mode Task to the current general agent/Main. Main coordinates the read-only `gcp-cost-analyzer` specialist directly using native delegation; do not invoke a nested orchestrator or add another mode gate.
   ```
   Direct Mode Task:
   - Mode: gcp-costs
   - Scope: quick
   - Projects: {project IDs or "all"}
   - Feature: gcp-cost-analysis
   - Workspace path: {resolved shared workspace}
   - Deliverable target: {explicit target, or the resolved workspace}
   ```

---
name: gcp-costs

## Important

- Main remains the coordinator and may delegate directly to `gcp-cost-analyzer`; do not create a second orchestrator or a separate approval/mode gate for cost analysis.
- Output: `00-gcp-costs.md` in the resolved workspace, unless the operator supplied an explicit deliverable target.
- The agent uses `gcloud` CLI commands (read-only) and optionally BigQuery for billing data
- **Prerequisites:** user must have `gcloud` installed and authenticated (`gcloud auth login`)
- **Required IAM roles:** Billing Viewer, Cloud Asset Viewer, Recommender Viewer, Compute Viewer
- The agent NEVER modifies, deletes, or creates any GCP resource — strictly read-only analysis
