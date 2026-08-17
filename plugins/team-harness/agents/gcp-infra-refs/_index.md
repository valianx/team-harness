# GCP Infra References — Manifest

> Read by the `gcp-infra` agent Reference Router (Phase 0). Maps detected
> task kind → reference file. The router fires only when the task matches a
> CDC / Datastream / logical-replication / Cloud-SQL→BigQuery build.

| Kind | File | Trigger keywords |
|------|------|-----------------|
| datastream-cloudsql-bigquery | datastream-cloudsql-bigquery.md | Datastream, CDC, change-data-capture, logical replication, replication slots, Cloud SQL PostgreSQL → BigQuery, CloudSQL to BigQuery |

## Path convention

`agents/gcp-infra-refs/{kind}.md`
(installed at `~/.claude/plugins/cache/.../th/<version>/agents/gcp-infra-refs/{kind}.md`).

## Fallback

If a kind file is absent or the manifest is unreadable: log
`gcp-infra-refs unavailable` and fall back to the agent's general posture
plus context7 / WebSearch verification. Never fabricate reference content.
