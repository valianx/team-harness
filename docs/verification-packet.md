# Verification Packet — Canonical Contract

This document is the **single source of truth** for `00-verify-packet.md`, a pipeline-only,
shared build-once-read-many artifact that Phase-3 verifiers (`qa`, conditional `adversary`,
`ux-reviewer` validate) read first instead of independently re-reading the full workspace
document set. Inline work and live ad hoc tester/QA/security reviews never create or require a
verification packet; they return bounded evidence in chat unless the operator explicitly asks for
a separate artifact. Agent files reference this contract by pointer — the schema itself lives
only here (multi-site invariant, `01-plan.md`).

**Origin.** The Stage-2 verify block measured 2.8M tokens across 40 June 2026 runs (median
86K/run) because each verifier re-read the same workspace narrative independently, with no
shared-read mechanism across separate agent contexts. The packet applies the same
build-once-read-many shape already used for `00-knowledge-context.md`
(`agents/ref-pipeline.md § "Intake"`) to the Stage-2 verify block.

---

## 1. Build site

**Who:** the orchestrator, never a leaf agent.

**When:** Phase 2.8 Freeze — after tester authoring, hygiene, build, lint, and frozen-diff
creation succeed, before Phase 3 is launched. See `agents/ref-pipeline.md § Phase 2.8`.

**Where:** `{docs_root}/00-verify-packet.md` — one file per task, overwritten in place on
every rebuild. **Never create a `00-verify-packet-v2.md` sibling** — the `Packet version`
header field is the versioning mechanism, not the filename.

---

## 1a. Tree-anchor algorithm (canonical — the ONLY place this command is defined)

**This is the single, canonical definition of "the dirty-diff hash" / "tree anchor" cited
throughout this project (`agents/ref-pipeline.md` — the Phase 2.8 fan-open recording, the
STAGE-GATE-3 precondition, and the Phase 3 staleness-invariant note; `agents/_shared/delivery-mechanics.md
§ 6(c)`; `docs/suite-evidence.md § 4`). Every one of those sites CITES this section by
pointer — none of them re-derives or restates the command.**

A plain `git rev-parse HEAD` is not sufficient on a dirty branch: it says nothing about
uncommitted changes, and `git diff` on its own never reports untracked paths (a new file
left uncommitted would otherwise leave a prior anchor looking unchanged over a tree that in
fact changed — the exact gap `docs/suite-evidence.md § 4`'s own independent guard exists to
backstop, since this algorithm alone cannot see a file it was never told to hash unless the
caller also runs the untracked-file guard described there).

**Concrete command (Bash, coordinator-self-applied — reproducible, not a description):**

```bash
tree_anchor="$(git rev-parse HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  # Tracked, uncommitted changes (staged + unstaged), workspaces/ excluded (always git-ignored).
  # Untracked paths -- git diff never reports these. Each one contributes its PATH, its
  # BYTE LENGTH, and its CONTENT, in sorted path order. All three are load-bearing:
  # concatenating contents alone is ambiguous (two files holding "X" and "Y" hash the same
  # as one holding "XY" beside an empty one), and omitting the path lets a rename alias a
  # different tree to the same anchor. The length prefix is what makes the framing
  # unambiguous without relying on a delimiter that could occur inside a file.
  dirty_hash="$( {
      git diff HEAD --binary -- . ':!workspaces'
      git ls-files --others --exclude-standard -z | sort -z \
        | while IFS= read -r -d '' p; do
            printf '%s\n%s\n' "$p" "$(wc -c <"$p" 2>/dev/null || echo 0)"
            cat -- "$p" 2>/dev/null
          done
    } | sha256sum | cut -d' ' -f1)"
  tree_anchor="${tree_anchor}+${dirty_hash}"
fi
echo "${tree_anchor}"
```

**Anchor equality** is a plain string comparison of the full `tree_anchor` value (`{sha}` alone
on a clean tree, `{sha}+{dirty_hash}` on a dirty one) — never a partial or SHA-prefix match.

**This algorithm alone is still not a complete guard.** It hashes whatever untracked content
exists AT THE MOMENT IT RUNS — it cannot detect a file that did not exist yet when the anchor
was FIRST recorded (Phase 2.8) but exists by the time a LATER comparison runs, unless that
later comparison also re-runs this same command fresh. Every site that compares against a
previously-recorded anchor (including STAGE-GATE-3 preparation) MUST
re-run this command fresh at comparison time, never reuse a stale `dirty_hash` — and the
implementation Freeze additionally requires a clean worktree and records exact commit/tree
object IDs. Delivery compares those IDs directly rather than re-running this dirty-tree
algorithm.

---

## 2. Packet content contract

**Hard cap: ≤120 lines / ~2-3K tokens.** A packet that cannot fit the cap is a signal the
task scope is too large for one packet, not a license to truncate the Deviations section
silently.

| Section | Content | Source |
|---|---|---|
| **Header** | `Feature:`, `Task identifier:`, `Built:` (ISO timestamp), `Packet version: N`, `Tree anchor:` (computed per § 1a), `Freeze commit:` and `Freeze tree:` (full object IDs from a clean candidate), `Base ref:` (copied from state `verification_base_ref`), `Frozen diff:` (`inputs/00-frozen.diff`) | orchestrator |
| **Scope** | `type`, `bug_tier` (1–4 metadata only), `security_sensitive`, `frontend_scope`, `complexity` | `00-state.md` |
| **Changed files** | Table: path + `new`\|`modify` + one-line role, plus `git diff --stat` output | implementer status block + `git diff --stat` |
| **Implementation summary** | Implementer status-block summary; `Deviations from Architecture` copied verbatim (or `"none"`); surviving `[CONSTRAINT-DISCOVERED]` annotations verbatim (or `"none"`) | `02-implementation.md` |
| **Test artifact** | Phase 2.7 suite result, tests added, AC→test map; `regression_test_path` + status for the bug-fix flow | `03-testing.md` (authoring section) |
| **Depth-on-demand pointers** | `01-plan.md` manifest, assigned task shards, named architecture/invariant anchors, `02-implementation.md`, `03-testing.md`, `inputs/00-frozen.diff`, reviews, root cause, and sketches as applicable | — never attach the full plan set by default |

### No AC section

The packet carries **no acceptance-criteria copy — verbatim or digested.** AC live in
the assigned `plan/tasks/Task-N.md`; every verifier whose verdict baselines on AC live-reads that
shard at dispatch time (§4 Step 0). Rationale: the plan sits outside the git tree in
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
**Tree anchor:** {sha [+ dirty-diff-hash]}  **Freeze commit:** {full sha}
**Freeze tree:** {full tree sha}  **Base ref:** {origin/main}
**Frozen diff:** inputs/00-frozen.diff

## Scope
type: {feature|fix|hotfix|refactor|enhancement} | bug_tier: {1-4|n-a} (metadata only) | security_sensitive: {true|false} | frontend_scope: {true|false} | complexity: {bounded|standard|complex}

## Changed Files
| Path | Type | Role |
|------|------|------|
| {path} | new\|modify | {one-line} |
{git diff --stat output}

### Excluded from the review surface
| Group | Files | Lines | Proven by |
|-------|-------|-------|-----------|
| {projection family} | {N} | {N} | {checker} |

Present only when `review-surface.mjs` returned a non-empty exclusion at this tree anchor, and
omitted entirely otherwise. Each excluded path is byte-identical to the canonical source named in
the tool result; the table exists so a reviewer can see what left the surface and which locally
executed checker proved it. When a checker withheld eligibility, record the withholding checker
here instead and carry the full surface.

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
- plan/tasks/Task-N.md (assigned tasks only)
- plan/architecture.md#{named-anchor} (only when referenced)
- plan/invariants.md#{named-invariant} (only when present and referenced)
- 02-implementation.md
- 03-testing.md
- inputs/00-frozen.diff
- reviews/01-plan-review.md (when present)
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

The packet and its `inputs/00-frozen.diff` review surface survive recovery/compaction (they
are files, not prompt context) and are observable by the operator. The existing per-verifier dispatch fields (file lists,
per-mode instructions, regression-test instructions) are unchanged and additive to this.

---

## 4. Read contract — packet-first, depth-on-demand

Every Phase-3 verifier's Session Context Protocol follows this ladder:

0. **Live AC read (mandatory, never replaced by the packet).** Every verifier whose
   verdict baselines on AC live-reads the assigned `plan/tasks/Task-N.md`
   at dispatch time, before or alongside the packet read. AC-baselining verifiers: `qa`
   (per-AC verdict), `ux-reviewer` validate (UI/UX AC), and `adversary` when attacking
   AC/plan controls as written. One task shard is small — this read is what
   makes an AC-substance edit, same-count reword included,
   visible with zero rebuild machinery.
1. **Read `00-verify-packet.md` for implementation context.** Changed files, deviations,
   evidence map, pointers — never AC (§2 states the packet carries none).
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

Every verifier performs the checks its grant can support before trusting the packet:

1. Read-verifiable floor for all agents: `Tree anchor` is non-empty and every packet-listed
   changed file resolves on disk.
2. Bash-capable agents additionally compare the anchor with the current working-tree state.
   Read-only agents do not claim this comparison; the orchestrator owns it at Freeze and every
   staleness trigger.

**On ANY mismatch:** treat the packet as stale. Escalate to the full-manifest read. Report
`packet_integrity: stale` (tree anchor / file-existence failure) or `packet_integrity:
mismatch` (scan-target failure — see §5). There is no AC-count point — the packet carries
no AC (§2).

### Git-anchored scan-target list (qa)

For verifiers whose contract scans changed SOURCE FILES with Bash (`qa`), the
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

### Status-block telemetry (all Phase-3 verifiers)

```
packet_used: true | false | absent
packet_escapes: {N}          # count of full docs opened beyond the packet
packet_integrity: ok | stale | mismatch | n-a
```

The orchestrator propagates these into the `phase.end` event's `tools.packet` object (see
`agents/ref-pipeline.md`).

---

## 5. Preserved reads — hard floor per agent

The packet replaces **workspace-narrative document reads only.** It never replaces a
source-code read, a mandatory independent-analysis input, or a suite execution. Written
explicitly per agent so the floor is auditable, not implied:

| Agent | Preserved read (unaffected by the packet) |
|---|---|
| `qa` | Source-code reads for file:line AC evidence; the mandatory sketch reads (`qa.md` Phase 0 step 3) |
| `adversary` | `inputs/00-frozen.diff`, architect security-assessment anchors, and implicated security TCs — its zero-overlap contract stays a mandatory independent read; a standalone design-review section is optional only when explicitly named |
| `ux-reviewer` (validate) | `reviews/01-ux-review.md` — the Stage-1 UI/UX AC baseline stays a mandatory read |

---

## 6. Staleness — rebuild triggers

The packet is a snapshot, not a live view. The orchestrator MUST rebuild it in place
(overwrite, increment `Packet version` — never a sibling file) before the next verifier
dispatch whenever EITHER of these fire:

1. **Any implementation/validation correction re-dispatch** (bounded or structural) —
   rebuild after the producer's patch, before re-running verifiers. This is the
   implementation → Freeze → validation route; plan repairs, operator decisions, and
   explicitly requested design work do not themselves consume a correction round or
   emit `iteration.start`.
2. **Non-empty `git diff --name-only`** against the packet's tree anchor at dispatch time.

There is NO plan-only rebuild trigger. A mechanical repair or coordinator transcription
does not stale the packet while no implementation tree has changed because the packet
carries no AC (§2) — the next verifier reads the live assigned task shard (§4 Step 0).
An explicit architect request starts a new design/Gate-1 path rather than a correction
round. Both remaining triggers are implementation-tree grounded; neither depends on the
orchestrator noticing a document edit outside the code tree.

---

## 7. How verifier quality is protected

- Opening full docs is **never forbidden** — the packet changes the default, not the
  ceiling.
- Source-code reads are **out of the packet's scope by contract** (§5).
- AC cannot be misstated by the packet because the packet does not carry them (§2) — every
  AC-baselining verifier reads its assigned task shard live (§4 Step 0).
- The integrity check **fails toward MORE reading for the facts it anchors** — tree state,
  changed-file existence, and the git-derived scan-target list (§4). The packet's narrative
  fields (implementation summary, deviations, evidence map) are protected by the
  authority-scoping rule (§2) instead of an anchor: no verdict rests on them as sole
  evidence, so a truncated or divergent narrative can misdirect navigation but cannot
  change a verdict's evidence base.
- `packet_escapes` / `packet_integrity` telemetry make packet quality measurable — a high
  escape rate is the signal to enrich the packet schema, not to tighten the read contract
  further.
- Every pipeline run's per-run parity line (§8) reports the verdict-doc-counted
  three-bucket dispatch classification and verifier catch rates against the June 2026
  baseline — the evidence base the operator evaluates whenever an ordered reversion of the
  packet-first contract is under consideration.

---

## 8. Parity reporting — not produced

A per-run parity line was specified here, to be computed from each run's own verdict documents
and written into `00-pipeline-summary.md`. No run has produced one, including the most recently
audited. The measurement it was meant to support — whether packet-first reading degrades verifier
coverage — is worth having, but it needs a producer before it needs a reporting contract.

---

## 9. Not in scope

Extending this packet mechanism to the Stage-1 panel (`ratify-plan` / `plan-review`) is
explicitly out of scope for this contract. The same build-once-read-many mechanic would cut
the measured 56-57K/run cost there too; flagged as a follow-up once the operator's
evaluation of the accumulated §8 parity data confirms the Stage-2 result holds.
