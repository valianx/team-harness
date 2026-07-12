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
task scope is too large for one packet, not a license to truncate the Deviations section
silently.

| Section | Content | Source |
|---|---|---|
| **Header** | `Feature:`, `Task identifier:`, `Built:` (ISO timestamp), `Packet version: N`, `Tree anchor:` (`git rev-parse HEAD`, plus a dirty-tree diff hash when uncommitted changes exist — same anchor mechanic as the recorded-state gate, `agents/orchestrator.md § Phase 3`), `Base ref:` (the task's recorded base, e.g. `origin/main`) | orchestrator |
| **Scope** | `type`, `bug_tier`, `security_sensitive`, `frontend_scope`, `complexity` | `00-state.md` |
| **Changed files** | Table: path + `new`\|`modify` + one-line role, plus `git diff --stat` output | implementer status block + `git diff --stat` |
| **Implementation summary** | Implementer status-block summary; `Deviations from Architecture` copied verbatim (or `"none"`); surviving `[CONSTRAINT-DISCOVERED]` annotations verbatim (or `"none"`) | `02-implementation.md` |
| **Test artifact** | Phase 2.7 suite result — feature-flow: the integrated suite (blind suite authored in Phase 2.3 `author-from-ac` plus gap-only tests added by the 2.7 gap-check), tests added, AC→test map; `regression_test_path` + status for the bug-fix flow | `03-testing.md` (authoring section) |
| **Full-document pointers** | Explicit paths to `01-plan.md`, `02-implementation.md`, `03-testing.md`, `reviews/04-security.md` (when later written), `01-root-cause.md` (fix flow), `sketches/*` | — the depth-on-demand escape hatch (§4) |

### No AC section

The packet carries **no acceptance-criteria copy — verbatim or digested.** AC live in
`01-plan.md § Task List`; every verifier whose verdict baselines on AC live-reads that
block at dispatch time (§4 Step 0). Rationale: `01-plan.md` sits outside the git tree in
obsidian mode, so no git anchor can detect an AC edit, and any copy-freshness mechanism
(count check, content digest) depends on prompt-compliance-dependent emission — the same
reliability class the June 2026 data measured at ~40%. The live read needs no new
emission and removes the AC-staleness class entirely, including same-count substance
edits a count check would miss.

### Authority scoping

The packet is a **navigation-and-context digest, not an evidence source.** No verifier
verdict may rest on a packet field as its sole evidence for a verdict-bearing fact: AC
come from the live plan (§4 Step 0), changed files from git at scan time (§4), and any
deviation or test claim that would influence a verdict is confirmed at its source
document (§-scoped) before it is cited. A truncated or divergent narrative field can
therefore misdirect navigation but can never change a verdict's evidence base.

### Skeleton

```markdown
# Verification Packet: {feature-name}
**Feature:** {feature-name}  **Task identifier:** {Task-N}
**Built:** {ISO timestamp}  **Packet version:** {N}
**Tree anchor:** {sha [+ dirty-diff-hash]}  **Base ref:** {origin/main}

## Scope
type: {feature|fix|hotfix|refactor|enhancement} | bug_tier: {0-4|n-a} | security_sensitive: {true|false} | frontend_scope: {true|false} | complexity: {simple|standard|complex}

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
- reviews/04-security.md (when written)
- 01-root-cause.md (fix flow only)
- sketches/* (if present)
```

---

## 3. Dispatch — digest, not duplication

Each Phase 3 / Phase 3.4 verifier dispatch payload carries a pointer plus a 10-line digest,
never the full packet body embedded in the prompt:

```
verification packet: {docs_root}/00-verify-packet.md (version {N}, tree anchor {sha})
digest: changed files {N}, deviations {yes|no}
```

The packet survives recovery/compaction (it is a file, not prompt context) and is
observable by the operator. The existing per-verifier dispatch fields (file lists,
per-mode instructions, regression-test instructions) are unchanged and additive to this.

---

## 4. Read contract — packet-first, depth-on-demand

Every Stage-2 verifier's Session Context Protocol follows this ladder:

0. **Live AC read (mandatory, never replaced by the packet).** Every verifier whose
   verdict baselines on AC live-reads the per-task AC block from `01-plan.md § Task List`
   at dispatch time, before or alongside the packet read. AC-baselining verifiers: `qa`
   (per-AC verdict), `tester` run-only (AC→test mapping confirmation), `ux-reviewer`
   validate (UI/UX AC), `adversary` (when attacking AC/plan controls as written). `security`
   does not baseline its verdict on AC (its scan target is code + scope flags) and needs no
   AC read; `acceptance-checker` is not a packet consumer at all (see
   `agents/acceptance-checker.md`). The AC block for one task is small (§-scoped, typically
   ≤30 lines) — this read is what makes an AC-substance edit, same-count reword included,
   visible with zero rebuild machinery.
1. **Read `00-verify-packet.md` for implementation context.** Changed files, deviations,
   test artifact, pointers — never AC (§2 states the packet carries none).
2. **Depth-on-demand (never forbidden):** open a full workspace document ONLY when (a) an
   AC references context the packet does not explain, (b) evidence beyond the packet is
   needed (deviation detail, root-cause chain, prior findings), or (c) the integrity
   spot-check below fails. Per the authority-scoping rule (§2), any packet narrative fact
   that would influence the verdict is confirmed at its source document (§-scoped) before
   being cited.
3. **Fail-open fallback:** packet absent → the verifier's current full input-manifest read,
   unchanged. Report `packet_used: absent`. This is backward-compatible with in-flight and
   legacy workspaces — never an error.

### Integrity spot-check (mandatory, cheap)

Every verifier performs this 2-point check before trusting the packet as sufficient:

1. The packet's `Tree anchor` matches `git rev-parse HEAD` / current working-tree state.
2. At least one packet-listed changed file exists on disk.

**On ANY mismatch:** treat the packet as stale. Escalate to the full-manifest read. Report
`packet_integrity: stale` (tree anchor / file-existence failure) or `packet_integrity:
mismatch` (scan-target failure — see §5). There is no AC-count point — the packet carries
no AC (§2).

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
| `adversary` | `reviews/04-security.md` — its zero-overlap, GO-seeking-vs-break-seeking contract stays a mandatory independent read |
| `ux-reviewer` (validate) | `reviews/01-ux-review.md` — the Stage-1 UI/UX AC baseline stays a mandatory read |

---

## 6. Staleness — rebuild triggers

The packet is a snapshot, not a live view. The orchestrator MUST rebuild it in place
(overwrite, increment `Packet version` — never a sibling file) before the next verifier
dispatch whenever EITHER of these fire:

1. **Any iteration re-dispatch** (bounded patch or structural, Cases A-D) — rebuild after
   the producer's patch, before re-running verifiers.
2. **Non-empty `git diff --name-only`** against the packet's tree anchor at dispatch time.

There is NO AC-edit rebuild trigger. An AC edit (Phase 2.5 late reconciliation, Case C
reword, operator review-surface edit) does not stale the packet because the packet carries
no AC (§2) — the edit reaches the next verifier through its live `01-plan.md § Task List`
read (§4 Step 0) with no orchestrator action required. Both remaining triggers are
git-grounded; neither depends on the orchestrator noticing a document edit outside the
code tree.

---

## 7. How verifier quality is protected

- Opening full docs is **never forbidden** — the packet changes the default, not the
  ceiling.
- Source-code reads are **out of the packet's scope by contract** (§5).
- AC cannot be misstated by the packet because the packet does not carry them (§2) — every
  AC-baselining verifier reads them live from `01-plan.md § Task List` (§4 Step 0).
- The integrity check **fails toward MORE reading for the facts it anchors** — tree state,
  changed-file existence, and the git-derived scan-target list (§4). The packet's narrative
  fields (implementation summary, deviations, test artifact) are protected by the
  authority-scoping rule (§2) instead of an anchor: no verdict rests on them as sole
  evidence, so a truncated or divergent narrative can misdirect navigation but cannot
  change a verdict's evidence base.
- `packet_escapes` / `packet_integrity` telemetry make packet quality measurable — a high
  escape rate is the signal to enrich the packet schema, not to tighten the read contract
  further.
- Every full-pipeline run's per-run parity line (§8) reports the verdict-doc-counted
  three-bucket dispatch classification and verifier catch rates against the June 2026
  baseline — the evidence base the operator evaluates whenever an ordered reversion of the
  packet-first contract is under consideration.

---

## 8. Per-run parity reporting (operator-evaluated)

**Reporting unit = one run.** Every full-pipeline run's `00-pipeline-summary.md` reports one
parity line, computable entirely from that run's own artifacts. There is no run counter, no
multi-run window, no window-close step, and no automatic trigger of any kind.

**Denominator — verdict-doc-derived, not breadcrumb- or `phase.end`-derived.** The
verifier-dispatch count is read from the workspace verdict docs — one dispatch per verifier
per iteration verdict entry: `03-testing.md` run-only section (tester), `reviews/04-validation.md`
(qa), `reviews/04-security.md` (security), `reviews/04-adversary.md` (adversary), `reviews/04-ux-validation.md`
(ux-reviewer validate). `00-subagent-trace.jsonl` breadcrumbs (`subagent.start`/
`subagent.stop` pairs filtered by verifier `agent_type`) demote to upward-only enrichment: a
breadcrumb-evidenced dispatch with no matching verdict entry is **ADDED** to the denominator
as telemetry-missing — breadcrumb absence can never **shrink** the count. The denominator is
**never** counted from `phase.end` events, whose emission is the unreliable layer this
contract's own Task-1 fix is repairing.

**Dispatch floor — exactly one derivation.** The floor is the should-have verifier set
derived strictly from that run's `00-state.md` scope flags: `tester` run-only + `qa`
unconditionally; + `security` and `adversary` iff `security_sensitive: true`; +
`ux-reviewer` validate iff `frontend_scope: true`. The floor is **never** derived from
`00-state.md § Agent Results` (the did-dispatch record) — a silently-skipped verifier must
push the run below its floor, not shrink the floor to match the undercount. A run whose
counted denominator (verdict-doc entries plus any breadcrumb-only telemetry-missing
additions) falls below its floor, or whose scope flags are unreadable, renders the parity
line as `UNMEASURABLE` — never as parity. N=0 always reads UNMEASURABLE, never parity.

**Per-dispatch classification — three mutually exclusive buckets:**

- **accepted-with-evidence** — a fresh, non-`backfilled: true` `phase.end` whose
  `tools.packet` shows `packet_integrity: ok` AND `packet_escapes: 0`.
- **fallback-with-evidence** — fresh telemetry showing `stale|mismatch`, `escapes > 0`, or
  `packet_used: absent|false`.
- **telemetry-missing** — the dispatch's `phase.end` is backfilled, carries no
  `tools.packet`, or is a breadcrumb-only addition with no matching verdict entry.

**Telemetry-missing ALWAYS counts as fallback-signal, never as acceptance.** A backfilled
event structurally cannot carry packet telemetry (the reconciliation backstop derives only
`duration_ms` from breadcrumbs — see `agents/orchestrator.md § Execution Events JSONL`), so
counting it any other way would let emission loss impersonate packet acceptance.

**What each run reports** (via the Task-1 `## Cost` checkpoint contract in
`agents/orchestrator.md § Pipeline Summary Protocol` — the `## Verification Packet`
section of `00-pipeline-summary.md`): the three-bucket breakdown above, and verifier catch
rates read from the workspace verdict documents, not from `phase.end` telemetry — security
findings by severity from `reviews/04-security.md`, qa AC-fail rate from
`reviews/04-validation.md § AC Coverage Results`, drift flags from
`reviews/04-validation.md § Drift Analysis` — each compared against the June 2026 baseline recorded
in the pipeline-validation research workspace (`02-june-empirical-analysis.md`, referenced
by pointer — not duplicated here). These artifacts exist deterministically whenever the
verifier ran.

**Ownership and rollback — operator-owned, no automatic trigger.** Parity data accumulates
in every full-pipeline summary; the OPERATOR evaluates it against the June 2026 baseline
whenever desired — there is no cross-run aggregation, window, or scheduled evaluation point
owned by the contract itself. Rollback is a one-line contract flip shipped as a normal PR:
the packet-first ladder default in the five verifier Session Context Protocols
(`agents/{qa,security,adversary,tester,ux-reviewer}.md` — §4 Step 1) flips back to the full
input-manifest read as the unconditional default (the §4 Step 3 fail-open fallback becomes
the primary path), and the orchestrator's packet build (§1) and digest-dispatch (§3) steps
are suspended until the schema (§2) is enriched. No clause in this contract computes this
automatically, and no text here claims one does.

**Honest bound (reporting aid, not a gate).** The parity line is rendered by the
orchestrator at prompt level and consumed by the operator — nothing gates on it. That
reliability class is acceptable here precisely because the consumer is human: a missing or
malformed line is itself visible evidence to the reader, and parity is only ever concluded
by the operator reading the line — silence cannot impersonate parity. The Task-1
fail-closed step-6 assert still requires the `## Cost` section at the 4 mandatory
checkpoints (§ Pipeline Summary Protocol).

---

## 9. Not in scope

Extending this packet mechanism to the Stage-1 panel (`ratify-plan` / `plan-review`) is
explicitly out of scope for this contract. The same build-once-read-many mechanic would cut
the measured 56-57K/run cost there too; flagged as a follow-up once the operator's
evaluation of the accumulated §8 parity data confirms the Stage-2 result holds.
