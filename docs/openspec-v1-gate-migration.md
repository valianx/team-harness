# Approved OpenSpec v1 workspace repair

This procedure adopts a legacy `sharded-v1` workspace whose Gate 1 approved
placeholder-derived artifacts and whose operator later authorized a bounded
execution-contract repair. It does not rewrite or replace Gate 1. It creates
one supplemental certificate that chains the immutable original Gate to the
repaired aggregate.

## Eligibility and invariants

Use this path only when all of the following are already durable:

- `inputs/gate1-binding.json` is the original valid consolidated Gate record;
- `00-execution-events.jsonl` contains, in order, the matching live Gate
  release, the live operator repair decision, the incident report, the repair
  success, and no implementation dispatch before the repair;
- `evidence/plan-contract-auto-repair.json` binds the old and new aggregate,
  every before/after service hash, and an identical normalized normative task
  prefix for every service;
- current snapshots, overlays, repository identities, and non-task OpenSpec
  sources validate; task checkbox differences are allowed only when already
  recorded monotonically in the service `openspec-progress.json`;
- the repair changed only execution-contract and derived artifacts. Any change
  to proposal, design, spec, task title/body, scope, behavior, or acceptance
  meaning requires normal Design and a new Gate 1.

The original Gate, nonce, snapshot, event log, repair evidence, OpenSpec source,
overlay, shards, quality manifest, aggregate, and pipeline state are inputs.
The only write performed by adoption is
`inputs/gate1-v1-migration.json`, written atomically and idempotently.

## Deterministic sequence

1. Record the live operator decision before repair. Author the missing
   execution-contract judgment in a reviewable workspace input; it is not
   inferred from task titles.
2. Dry-run that input, apply it once, regenerate snapshots, overlays, shards,
   quality manifest, and aggregate using the normal validators, then persist
   the before/after repair evidence and success event. Do not edit the original
   Gate record.
3. Run `migrate-v1` with `mode: dry-run`. A failure is closed and writes
   nothing.
4. Run the identical request with `mode: apply`. This writes only the
   supplemental certificate. Repeating it is a no-op when the bytes match and
   fails closed when an existing certificate differs.
5. Run `verify-v1-migration` before recovery and before each first dispatch
   after recovery. Continue under the original Gate only when it passes.

## Exact migration for `payin-orchestration-services`

The semantic repair and all regenerated artifacts already exist in:

```text
/mnt/c/obsidian-vault/Work/work-logs/zippy/2026-08-24_payin-orchestration-services
```

Do not rerun `inputs/build-execution-contracts.mjs --apply` or regenerate the
derived set for this adoption. From the Team Harness repository, first perform
the read-only proof:

```bash
node skills/pipeline/scripts/openspec-bindings.mjs migrate-v1 '{"workspace":"/mnt/c/obsidian-vault/Work/work-logs/zippy/2026-08-24_payin-orchestration-services","aggregatePath":"inputs/openspec-bindings.json","gatePath":"inputs/gate1-binding.json","repairEvidencePath":"evidence/plan-contract-auto-repair.json","eventsPath":"00-execution-events.jsonl","target":"inputs/gate1-v1-migration.json","incidentId":"th-placeholder-autorepair-20260825","mode":"dry-run"}'
```

Expected identities for the current workspace are:

```text
original gate file sha256:        49feb59681f1d59a6e316cd356f75d92e92ada085c0be739271094544f62ea80
original aggregate sha256:        bd68ff28ba34a39af9676e5b7b9d1ffeff9cf560f526fd013ab29af1c438d208
original gate identity sha256:    c42f92e13eb2067681e1759af57138043b9c701a2bae6bb02e39ad557940c230
repair evidence sha256:           ccac5c0a3ac84f98b4e7cc46793cab4c4ef75d848f0520aaf386d79166ee581c
current aggregate sha256:         743f78c5070197df313e17e047ef349234c1c6ea6c8bd7dabf1eb139d1e89086
continuation identity sha256:      180118f55ad609ea2e37c3f97d55c03de20210e801a360a1ba8b41be3bf7c33d
migration certificate sha256:     ab2356c53afe64e973c239724c65a40b666f3d56279105bfc3f8563723a33d2d
```

If the dry-run returns those identities with `verdict: pass`, write the one
new artifact:

```bash
node skills/pipeline/scripts/openspec-bindings.mjs migrate-v1 '{"workspace":"/mnt/c/obsidian-vault/Work/work-logs/zippy/2026-08-24_payin-orchestration-services","aggregatePath":"inputs/openspec-bindings.json","gatePath":"inputs/gate1-binding.json","repairEvidencePath":"evidence/plan-contract-auto-repair.json","eventsPath":"00-execution-events.jsonl","target":"inputs/gate1-v1-migration.json","incidentId":"th-placeholder-autorepair-20260825","mode":"apply"}'
```

Then verify it without writes:

```bash
node skills/pipeline/scripts/openspec-bindings.mjs verify-v1-migration '{"workspace":"/mnt/c/obsidian-vault/Work/work-logs/zippy/2026-08-24_payin-orchestration-services","aggregatePath":"inputs/openspec-bindings.json","gatePath":"inputs/gate1-binding.json","repairEvidencePath":"evidence/plan-contract-auto-repair.json","eventsPath":"00-execution-events.jsonl","target":"inputs/gate1-v1-migration.json","incidentId":"th-placeholder-autorepair-20260825"}'
```

The authoritative continuation tuple is the unchanged
`inputs/gate1-binding.json` plus the new
`inputs/gate1-v1-migration.json`. The certificate binds the old aggregate, the
operator-decision event, repair evidence, current aggregate, service order,
normative-prefix proofs, and first implementation dispatch. It does not claim
that the repaired aggregate was the byte sequence originally approved.
