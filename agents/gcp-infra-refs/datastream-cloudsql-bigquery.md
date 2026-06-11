# GCP Infra Reference: Datastream + Cloud SQL (PostgreSQL) → BigQuery

> Loaded on demand by the `gcp-infra` agent via the Reference Router (Phase 0).
> Applies to tasks involving: Datastream, CDC, logical replication / replication
> slots, or moving Cloud SQL (PostgreSQL) data into BigQuery.
>
> All content is generic (no project-specific IDs, instance names, private IPs,
> or real table names). Verify current behavior against the official doc anchors
> in Section 10 before asserting facts in the plan.

---

## 1. Source must be the primary, never a read replica

Datastream performs CDC via **logical replication** (publication + replication
slot with `pgoutput`). Logical decoding requires an instance capable of write
operations — a Cloud SQL read replica is a physical standby and cannot host
logical replication slots.

**Rule:** always target the **primary instance** as the Datastream source. Never
use a read replica. Confirm this with the operator before proceeding.

Note: Datastream reads the WAL; it does NOT execute `SELECT` against live
tables. This means originating from the primary adds no transactional query
load to the production database — the risk is WAL retention (see Section 3),
not CPU or I/O from queries.

Doc reference: Cloud SQL documentation explicitly warns against using replicas
as Datastream sources. See Section 10 anchor for the official URL.

---

## 2. Connectivity: VPC peering is non-transitive — a reverse-proxy is mandatory

Cloud SQL private IPs are typically assigned from a **Private Services Access**
peering range (e.g., `servicenetworking`). Datastream's private connectivity
creates its **own** VPC peering into the customer VPC. VPC peering in GCP is
**not transitive**: Datastream peered to `customer-vpc` cannot chain to the
`servicenetworking` peering to reach the Cloud SQL private IP directly.

**Pattern (documented by Google):** place a **VM reverse-proxy** (with IP
forwarding + iptables DNAT/SNAT) inside `customer-vpc`. A VM native to
`customer-vpc` reaches the Cloud SQL private IP via the existing
`servicenetworking` peering. Datastream reaches the VM via its own peering.

Startup script pattern for the proxy VM (replace `DB_ADDR` and `DB_PORT`):
```bash
#!/bin/bash
export DB_ADDR=<cloud-sql-private-ip>
export DB_PORT=5432
echo 1 > /proc/sys/net/ipv4/ip_forward
md="http://metadata.google.internal/computeMetadata/v1/instance"
vm_ip="$(curl -s -H "Metadata-Flavor: Google" ${md}/network-interfaces/0/ip)"
iptables -t nat -A PREROUTING  -p tcp --dport $DB_PORT -j DNAT --to-destination $DB_ADDR:$DB_PORT
iptables -t nat -A POSTROUTING -p tcp --dport $DB_PORT -j SNAT --to-source $vm_ip
```

**Connection profile:** the Datastream PostgreSQL connection profile must point
to the **proxy VM IP** (or ILB IP in HA configuration), NEVER to the Cloud SQL
private IP directly.

**Firewall:** ingress from the Datastream private-connectivity `/29` CIDR range
to the proxy VM on port 5432. Egress from the proxy VM to the Cloud SQL private
IP on port 5432 (if egress-deny rules are in place).

**High availability (recommended for production):** two proxy VMs in different
zones, in an instance group, behind an **Internal passthrough Network Load
Balancer** (TCP). Health check on port 5432. The connection profile points to
the ILB forwarding-rule IP.

**Private Connectivity Configuration:** reserve a free `/29` CIDR that does not
overlap any existing subnet or peering range in the customer VPC.

---

## 3. Replication-slot risk model + valve + slot-discipline runbook + alerts

A replication slot orders PostgreSQL to **retain WAL until the consumer
(Datastream) reads it**. If the stream pauses, lags, or is deleted without
dropping the slot, WAL accumulates on the primary's disk.

**WAL amplification:** each row-level change (even an update to a single column)
generates a full WAL record. High-churn tables (state machines, audit logs,
payment status transitions) can produce WAL volume far exceeding the table's
on-disk size. Plan for this when sizing the `max_slot_wal_keep_size` valve.

**Disk growth:** Cloud SQL disks grow via auto-resize but **never shrink**. A
slot that has accumulated WAL inflates the SSD permanently; even after the slot
is dropped the extra disk size remains. Set a `storageAutoResizeLimit` to cap
unbounded growth.

### Defense 1 — Valve: `max_slot_wal_keep_size`

PostgreSQL 13+ flag (Cloud SQL PG17+). Sets a hard limit on WAL retained per
slot. When WAL exceeds the limit, PostgreSQL **invalidates** the slot (marks it
`lost`) and releases the WAL. The CDC pipeline breaks (slot must be recreated +
full backfill), but the primary is protected.

- Trade-off: pipeline failure is preferable to payment-system degradation.
- Cloud SQL PG17 valid range: `102400` – `10485760` MB (100 GB – 10 TB).
  The **minimum configurable value is 100 GB**.
- If the primary disk is smaller than the valve threshold, the auto-resize
  limit must be set below the threshold to ensure the valve fires before the
  disk becomes prohibitively large.
- Configure on the **primary**; set both `max_slot_wal_keep_size` and a
  `storageAutoResizeLimit` together.

### Defense 2 — Slot discipline (most important)

**Principle:** a replication slot must never exist without an active consumer.

- Create the slot only immediately before starting the stream.
- When the stream is paused, deleted, or the migration is cancelled: **always
  drop the slot manually** from the primary:
  ```sql
  SELECT pg_drop_replication_slot('<slot_name>');
  ```
- Deleting the Datastream stream does **not** drop the PostgreSQL slot.
- Record this procedure in the runbook with a mandatory pre-teardown step.

### Defense 3 — Cloud Monitoring alerts

Two mandatory alert policies:

1. **Disk usage growth**: metric `cloudsql.googleapis.com/database/disk/bytes_used`
   or `disk/utilization`. Alert on sustained growth or threshold crossing.
   Auto-resize hides the problem until it appears on the invoice; early alerting
   is the only signal.
2. **Replication lag**: alert when replication slot lag is sustained above a
   threshold (e.g., > 30 min continuously). This signals Datastream has stopped
   consuming and WAL is accumulating.

---

## 4. Partitioned tables: `publish_via_partition_root` is irreversible

When any replicated table uses PostgreSQL declarative partitioning, the
`publish_via_partition_root` flag in the publication **must be decided before
the stream starts**. Changing it after a stream has consumed the publication
**permanently breaks the stream** (official Datastream limitation).

**Recommended:** create the publication with `WITH (publish_via_partition_root = true)`.
In the Datastream stream, select **only the root table**, NOT individual
partitions. This produces a single BigQuery table for the partitioned relation.

**Alternative:** `publish_via_partition_root = false` (default). Select only
individual partitions, not the root. Produces one BigQuery table per partition.

The partition table itself (the root) and its partitions must not both be
selected in the stream — mixing them causes backfill + ongoing-change
discrepancies.

Doc reference: see Section 10 anchor for the official partitioned-tables doc.

---

## 5. HA-failover slot durability — verify, do not assume

When the Cloud SQL primary has HA (Regional configuration), a failover may or
may not preserve the logical replication slot, depending on the Cloud SQL
version and how the HA mechanism works internally.

PostgreSQL 17 introduced native failover slot synchronization
(`sync_replication_slots` + `hot_standby_feedback`). Cloud SQL HA uses a
regional disk failover (not replica promotion), so slot survival is plausible
but **not explicitly documented by Google** as of the writing of this reference.

**Required action before production apply:**
- Either (a) perform a test failover in a non-production environment and confirm
  `pg_replication_slots` retains the slot and its LSN position; or
  (b) open a Google Cloud support case to confirm the behavior for the specific
  Cloud SQL PG version in use.

If the slot does not survive failover, a failover triggers the slot-recreation
procedure from Defense 2 (drop + recreate + full backfill). This must be
documented as a runbook step.

---

## 6. Schema evolution / DDL handling matrix

Datastream propagates some DDL changes automatically but not all:

| DDL change on the source | Datastream behavior |
|---|---|
| Add column | Propagated automatically on the next change event |
| Add table (within the publication) | Picked up automatically |
| Drop column | Not propagated cleanly; requires manual intervention |
| Change column data type | Not supported automatically; requires manual intervention |
| Reorder columns | Not tracked automatically |
| Array types | Not supported by Datastream |

**Required action:** define a schema-change management process before production
apply. Establish: who notifies the data team before any `ALTER TABLE` that drops
or changes the type of a replicated column, and how the stream and BigQuery
table are reconciled. Without this process, a `DROP COLUMN` can corrupt or
stall the stream silently.

---

## 7. REPLICA IDENTITY check

Datastream's Merge/Upsert mode uses the primary key for row identification.
With a PK, `REPLICA IDENTITY DEFAULT` is sufficient. However, if any target
table has `REPLICA IDENTITY NOTHING` for historical reasons, `UPDATE` and
`DELETE` events will not replicate correctly.

**Verification query** (run on the source database before production apply):
```sql
SELECT n.nspname AS schema, c.relname AS table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'default (uses PK)'
    WHEN 'n' THEN 'nothing  <-- PROBLEM'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1, 2;
```

Expected result: `default (uses PK)` for every replicated table. Any table
showing `nothing` must be corrected before creating the stream:
```sql
ALTER TABLE <schema>.<table> REPLICA IDENTITY DEFAULT;
```

---

## 8. Cost drivers checklist

Include an order-of-magnitude estimate for each driver in the plan:

| Cost driver | Notes |
|---|---|
| Datastream GB processed | Backfill (entire historical table size) + ongoing CDC volume. High-churn tables produce significantly more WAL than their at-rest size. |
| BigQuery storage | Native table storage for replicated data. |
| BigQuery ingestion (Storage Write API) | Charged per GB written via Merge/Upsert. |
| BigQuery queries | Per-TB scanned for analytical workloads. `Max Staleness` reduces cost by batching inserts — estimate its effect on query freshness. |
| Proxy VM(s) | Compute cost 24/7. HA configuration doubles the VM count. |
| Internal Load Balancer (HA only) | Forwarding rule + processed data cost. |
| Permanent SSD inflation | Cloud SQL disks never shrink. A slot incident that inflates the disk adds permanent SSD cost. |

---

## 9. Pre-flight specifics for a Datastream / Cloud SQL build

Before the apply gate, verify all of the following:

1. **`cloudsql.logical_decoding` flag**: not set by default. Enabling it
   **requires a primary instance restart** — schedule a maintenance window.
   Confirm `wal_level=logical` after the restart.
2. **`max_replication_slots` and `max_wal_senders`**: confirm they are large
   enough (PostgreSQL 17 defaults ≥ 10; one slot + one sender per Datastream
   stream is typical).
3. **`cloudsql.enable_pglogical`**: NOT required for the `pgoutput` logical
   decoding path used by Datastream. Leave it off.
4. **Required IAM** (enumerate for the operator before apply):
   - `roles/cloudsql.admin` — set flags, restart, manage replication user
   - `roles/cloudsql.client` — connect to run DDL (publication + slot creation)
   - `roles/datastream.admin` — connection profiles, private connectivity, stream
   - `roles/bigquery.admin` (or `dataEditor` + `jobUser` scoped to the dataset)
   - `roles/compute.networkAdmin` — private connectivity peering, firewall rules
   - `roles/compute.instanceAdmin.v1` — proxy VM creation and management
   - `roles/monitoring.alertPolicyEditor` — Cloud Monitoring alert policies
   - Datastream service account needs `roles/bigquery.dataEditor` + `roles/bigquery.jobUser` on the destination dataset
5. **Tool availability**: verify `gcloud`, `bq`, and `psql` are present and
   functional on the operator's machine before the apply. `bq` requires
   Python 3; confirm `python3` resolves correctly.
6. **Free `/29` CIDR** for the Datastream private-connectivity configuration.
   Must not overlap any existing subnet, PSA range, or existing peering range
   in the customer VPC.
7. **Dedicated replication user** (recommended over using an admin account):
   ```sql
   CREATE USER datastream WITH REPLICATION LOGIN PASSWORD '<strong-secret>';
   GRANT SELECT ON ALL TABLES IN SCHEMA <schema> TO datastream;
   ALTER DEFAULT PRIVILEGES IN SCHEMA <schema> GRANT SELECT ON TABLES TO datastream;
   ```
8. **`publish_via_partition_root` decision** (if any replicated table is
   partitioned): irreversible once the stream starts — confirm before creating
   the publication.
9. **`Max Staleness` on BigQuery tables**: configure after Datastream creates
   the tables. Reduces Storage Write API ingestion costs by batching. Typical
   value: 1 hour for non-real-time analytics.

---

## 10. Official doc anchors

Verify the current behavior against these sources before asserting facts in the
plan. Use WebSearch/WebFetch if context7 does not cover these GCP service docs.

- **Datastream Cloud SQL PostgreSQL source configuration**:
  `https://cloud.google.com/datastream/docs/sources#postgresql`
- **Datastream private connectivity** (VPC peering + reverse-proxy pattern):
  `https://cloud.google.com/datastream/docs/private-connectivity`
- **Partitioned tables in Datastream**:
  `https://cloud.google.com/datastream/docs/work-with-postgresql-partitioned-tables`
- **Cloud SQL logical decoding flags**:
  `https://cloud.google.com/sql/docs/postgres/flags`
- **Cloud SQL HA overview** (regional failover mechanism):
  `https://cloud.google.com/sql/docs/postgres/high-availability`

Use these URLs with `WebFetch` to confirm current behavior. Do not assert
version-specific facts (e.g., failover slot behavior, flag availability) from
training knowledge alone.
