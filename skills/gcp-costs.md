Analyze the input: $ARGUMENTS

---

## Mode 1 — Full analysis (default)

Examples: `/gcp-costs`, `/gcp-costs all`, `/gcp-costs full`

1. Parse the input:
   - If no arguments or "all" or "full": full analysis across all accessible GCP projects

2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: gcp-costs
   - Scope: full
   - Projects: all accessible
   - Feature: gcp-cost-analysis
   ```

## Mode 2 — Scoped analysis (specific projects or services)

Examples: `/gcp-costs project-abc project-xyz`, `/gcp-costs --service compute`, `/gcp-costs project-abc --service sql`

1. Parse the input:
   - Extract project IDs (plain words that look like project IDs)
   - Extract service filter if `--service` flag present (compute, sql, gke, storage, functions, run, network)

2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: gcp-costs
   - Scope: scoped
   - Projects: {comma-separated project IDs, or "all" if only service filter}
   - Service filter: {service name, or "all" if only project filter}
   - Feature: gcp-cost-analysis
   ```

## Mode 3 — Quick scan (idle resources only)

Examples: `/gcp-costs --quick`, `/gcp-costs --quick project-abc`

1. Parse the input:
   - Detect `--quick` flag
   - Extract optional project IDs

2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: gcp-costs
   - Scope: quick
   - Projects: {project IDs or "all"}
   - Feature: gcp-cost-analysis
   ```

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke the `gcp-cost-analyzer` agent directly
- The th-orchestrator will route to the `gcp-cost-analyzer` agent
- Output: `session-docs/{feature-name}/00-gcp-costs.md`
- The agent uses `gcloud` CLI commands (read-only) and optionally BigQuery for billing data
- **Prerequisites:** user must have `gcloud` installed and authenticated (`gcloud auth login`)
- **Required IAM roles:** Billing Viewer, Cloud Asset Viewer, Recommender Viewer, Compute Viewer
- The agent NEVER modifies, deletes, or creates any GCP resource — strictly read-only analysis
