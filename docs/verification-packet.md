# Verification Packet — Canonical Contract

This document is the **single source of truth** for `00-verify-packet.md`, the shared,
build-once-read-many artifact that Stage-2 verifiers (`tester` run-only, `qa`, `security`,
`adversary`, `ux-reviewer` validate) read first instead of independently re-reading the
full workspace document set. Agent files reference this contract by pointer — the schema
itself lives only here (multi-site invariant, `01-plan.md`).

**Origin.** The Stage-2 verify block measured 2.8M tokens across 40 June 2026 runs (median
86K/run) because each verifier re-read the same workspace narrative independently, with no
shared-read mechanism across separate agent contexts. The packet applies the same
build-once-read-many shape already used for `00-knowledge-context.md`
(`agents/orchestrator.md § Phase 0a Step 2`) to the Stage-2 verify block.

---

## 1. Build site

**Who:** the orchestrator, never a leaf agent.

**When:** Phase 2.7 close — after the tester's authoring status block returns
`status: success` and after the A1-F3/A1-F4 browser-readiness checks, before Phase 3 is
launched. See `agents/orchestrator.md § Phase 2.7`.

**Where:** `{docs_root}/00-verify-packet.md` — one file per task, overwritten in place on
every rebuild. **Never create a `00-verify-packet-v2.md` sibling** — the `Packet version`
header field is the versioning mechanism, not the filename.

---

## 2. Packet content contract

**Hard cap: ≤120 lines / ~2-3K tokens.** A packet that cannot fit the cap is a signal the
task scope is too large for one packet, not a license to truncate the AC block or the
Deviations section silently.

| Section | Content | Source |
|---|---|---|
| **Header** | `Feature:`, `Task identifier:`, `Built:` (ISO timestamp), `Packet version: N`, `Tree anchor:` (`git rev-parse HEAD`, plus a dirty-tree diff hash when uncommitted changes exist — same anchor mechanic as the recorded-state gate, `agents/orchestrator.md § Phase 3`), `Base ref:` (the task's recorded base, e.g. `origin/main`) | orchestrator |
| **Scope** | `type`, `bug_tier`, `security_sensitive`, `frontend_scope`, `complexity` | `00-state.md` |
| **Acceptance Criteria** | The per-task AC block **copied VERBATIM** — never paraphrased. Paraphrase is the lossiness vector this contract exists to avoid. | `01-plan.md § Task List` |
| **Changed files** | Table: path + `new`\|`modify` + one-line role, plus `git diff --stat` output | implementer status block + `git diff --stat` |
| **Implementation summary** | Implementer status-block summary; `Deviations from Architecture` copied verbatim (or `"none"`); surviving `[CONSTRAINT-DISCOVERED]` annotations verbatim (or `"none"`) | `02-implementation.md` |
| **Test artifact** | Phase 2.7 suite result, tests added, AC→test map; `regression_test_path` + status for the bug-fix flow | `03-testing.md` (authoring section) |
| **Full-document pointers** | Explicit paths to `01-plan.md`, `02-implementation.md`, `03-testing.md`, `04-security.md` (when later written), `01-root-cause.md` (fix flow), `sketches/*.md` | — the depth-on-demand escape hatch (§4) |

### Skeleton

```markdown
# Verification Packet: {feature-name}
**Feature:** {feature-name}  **Task identifier:** {Task-N}
**Built:** {ISO timestamp}  **Packet version:** {N}
**Tree anchor:** {sha [+ dirty-diff-hash]}  **Base ref:** {origin/main}

## Scope
type: {feature|fix|hotfix|refactor|enhancement} | bug_tier: {0-4|n-a} | security_sensitive: {true|false} | frontend_scope: {true|false} | complexity: {simple|standard|complex}

## Acceptance Criteria
{verbatim per-task AC block from 01-plan.md § Task List}

## Changed Files
| Path | Type | Role |
|------|------|------|
| {path} | new\|modify | {one-line} |
{git diff --stat output}

## Implementation Summary
{implementer status-block summary}
**Deviations from Architecture:** {verbatim, or "none"}
**Surviving [CONSTRAINT-DISCOVERED] tags:** {verbatim, or "none"}

## Test Artifact
{Phase 2.7 suite result} | tests added: {N}
{AC → test map}
regression_test_path: {path or "n/a"}

## Full-Document Pointers
- 01-plan.md
- 02-implementation.md
- 03-testing.md
- 04-security.md (when written)
- 01-root-cause.md (fix flow only)
- sketches/*.md (if present)
```

---

## 3. Dispatch — digest, not duplication

Each Phase 3 / Phase 3.4 verifier dispatch payload carries a pointer plus a 10-line digest,
never the full packet body embedded in the prompt:

```
verification packet: {docs_root}/00-verify-packet.md (version {N}, tree anchor {sha})
digest: AC count {N}, changed files {N}, deviations {yes|no}
```

The packet survives recovery/compaction (it is a file, not prompt context) and is
observable by the operator. The existing per-verifier dispatch fields (file lists,
per-mode instructions, regression-test instructions) are unchanged and additive to this.

---

## 4. Read contract — packet-first, depth-on-demand

Every Stage-2 verifier's Session Context Protocol follows this ladder:

1. **Read `00-verify-packet.md` first.**
2. **Depth-on-demand (never forbidden):** open a full workspace document ONLY when (a) an
   AC references context the packet does not explain, (b) evidence beyond the packet is
   needed (deviation detail, root-cause chain, prior findings), or (c) the integrity
   spot-check below fails.
3. **Fail-open fallback:** packet absent → the verifier's current full input-manifest read,
   unchanged. Report `packet_used: absent`. This is backward-compatible with in-flight and
   legacy workspaces — never an error.

### Integrity spot-check (mandatory, cheap)

Every verifier performs this check before trusting the packet as sufficient:

1. The packet's `Tree anchor` matches `git rev-parse HEAD` / current working-tree state.
2. At least one packet-listed changed file exists on disk.
3. The packet's AC count matches the AC count in `01-plan.md § Task List` for this task.

**On ANY mismatch:** treat the packet as stale. Escalate to the full-manifest read. Report
`packet_integrity: stale` (tree anchor / file-existence failure) or `packet_integrity:
mismatch` (AC-count or scan-target failure — see §5).

### Git-anchored scan-target list (security, qa)

For verifiers whose contract scans changed SOURCE FILES (`security`, `qa`), the
**authoritative scan-target list is derived from git at scan time**, not from the packet:

```
git diff --name-only {Base ref}
```

The packet's "Changed files" table is a **cross-check only**. Any path returned by the git
command that is absent from the packet's table sets `packet_integrity: mismatch` and
escalates to the full-manifest read. This closes the omission blind spot: a packet that
under-reports changed files would otherwise pass integrity silently and narrow the scan
scope. The packet replaces workspace-doc reads only — it never replaces or narrows the
changed-file list a scan-contract verifier resolves.

### Status-block telemetry (all Stage-2 verifiers)

```
packet_used: true | false | absent
packet_escapes: {N}          # count of full docs opened beyond the packet
packet_integrity: ok | stale | mismatch | n-a
```

The orchestrator propagates these into the `phase.end` event's `tools.packet` object (see
`agents/orchestrator.md § Populating the tools field on phase.end`).

---

## 5. Preserved reads — hard floor per agent

The packet replaces **workspace-narrative document reads only.** It never replaces a
source-code read, a mandatory independent-analysis input, or a suite execution. Written
explicitly per agent so the floor is auditable, not implied:

| Agent | Preserved read (unaffected by the packet) |
|---|---|
| `security` | Phase 1 discovery scan AND reads of the changed SOURCE FILES themselves — the scan target is code, not the packet |
| `qa` | Source-code reads for file:line AC evidence; the mandatory sketch reads (`qa.md` Phase 0 step 3) |
| `tester` (run-only) | Suite execution; `02-regression-test.md` (fix flow) |
| `adversary` | `04-security.md` — its zero-overlap, GO-seeking-vs-break-seeking contract stays a mandatory independent read |
| `ux-reviewer` (validate) | `01-ux-review.md` — the Stage-1 UI/UX AC baseline stays a mandatory read |

---

## 6. Staleness — rebuild triggers

The packet is a snapshot, not a live view. The orchestrator MUST rebuild it in place
(overwrite, increment `Packet version` — never a sibling file) before the next verifier
dispatch whenever ANY of these fire:

1. **Any iteration re-dispatch** (bounded patch or structural, Cases A-D) — rebuild after
   the producer's patch, before re-running verifiers.
2. **Phase 2.5 constraint reconciliation** alters AC after Phase 2.7 closed.
3. **Case C criteria adjustment** — AC text edited in `01-plan.md § Task List`.
4. **Non-empty `git diff --name-only`** against the packet's tree anchor at dispatch time.

A Phase 3.6 (acceptance-checker) re-run counts as a verifier dispatch for trigger 4.

---

## 7. How verifier quality is protected

- Opening full docs is **never forbidden** — the packet changes the default, not the
  ceiling.
- Source-code reads are **out of the packet's scope by contract** (§5).
- AC text is **verbatim, never summarized** (§2).
- The integrity check **fails toward MORE reading, never less** (§4).
- `packet_escapes` / `packet_integrity` telemetry make packet quality measurable — a high
  escape rate is the signal to enrich the packet schema, not to tighten the read contract
  further.
- A 10-run post-merge canary window (§8) compares fallback rate and verifier catch rates
  against the June 2026 baseline, with a defined rollback trigger.

---

## 8. Measured-parity canary window (10-run rollback contract)

**Window:** the first 10 full-pipeline runs after this contract merges.

**What each run reports** (via the Task-1 `## Cost` checkpoint contract in
`agents/orchestrator.md § Pipeline Summary Protocol` — the `## Verification Packet`
section of `00-pipeline-summary.md`):

- **(a) Packet fallback rate** — the fraction of verifier dispatches in the run that
  escalated to the full-manifest read via `packet_integrity: stale|mismatch` or
  depth-on-demand (`packet_escapes > 0`).
- **(b) Verifier catch rates** — security findings by severity, qa AC-fail rate,
  acceptance-checker drift-flag count — each compared against the June 2026 baseline
  recorded in the pipeline-validation research workspace (`02-june-empirical-analysis.md`,
  referenced by pointer — not duplicated here).

**Rollback trigger.** Across the 10-run window, if EITHER of these holds:

- Security Critical/High findings AND qa AC-fails are both zero, WHILE the fallback rate is
  ≤10% of verifier dispatches (packets accepted everywhere yet catching nothing — the
  blinding signature), OR
- Any tracked catch rate falls below half its June baseline, under the same ≤10% fallback
  condition,

then the packet-first read contract **reverts to full reads**:

1. The packet-first ladder text in all five verifier Session Context Protocols
   (`agents/{qa,security,adversary,tester,ux-reviewer}.md`) flips back to the full
   input-manifest read as the unconditional default — the §4 Step 3 fail-open fallback
   becomes the primary path, not the exception.
2. The orchestrator's packet build (§1) and digest-dispatch (§3) steps are suspended.
3. Suspension holds until the packet schema (§2) is enriched to close the observed gap and
   a new 10-run canary window passes without triggering rollback.

**Non-triggering condition:** a fallback rate above 10% is NOT a rollback trigger by
itself — a higher escape rate means the depth-on-demand ladder is working as designed
(§7). Only the combination of near-zero fallback AND near-zero or degraded catch signals
the blind-spot failure mode this canary exists to detect.

---

## 9. Not in scope

Extending this packet mechanism to the Stage-1 panel (`ratify-plan` / `plan-review`) is
explicitly out of scope for this contract. The same build-once-read-many mechanic would cut
the measured 56-57K/run cost there too; flagged as a follow-up once the canary window (§8)
confirms the Stage-2 result holds.
