# Output Contract Patterns — Intensity Levels, Preservation, and Measurement

> Canonical reference for the full-lane output-verbosity contract. Defines the four named
> compression intensity levels every agent report maps to, the verbatim-preservation rule, the
> clarity exemptions, the iteration re-narration ban, and the before/after measurement method.
> `agents/_shared/output-template.md § Output Contract — Compression` carries a compact mirror of
> the intensity-level table plus a pointer here — the two tables are a multi-site invariant and
> must not diverge. Consumers apply these rules to their own report/body sections; they reference
> this file, they do not restate its content.

---

## 1. Why a shared contract

Report/body verbosity in the full lane concentrates in a handful of artifact classes —
pipeline-mode findings from `security`/`adversary`/`reviewer`, iteration narratives, and two
free-growing infra files (`00-execution-events.md`, `00-state.md`) — while several existing
ceilings already hold in production (`00-pipeline-summary.md § Cost` at 1-3% of run bytes,
`reviewer.md` suggestion/nitpick caps, `plan-reviewer.md`'s 7-bullet cap on
`### Decisions for human review`). This contract generalizes the working ceilings into one
reference so every consumer names the same four levels instead of inventing per-agent budgets.

**Non-negotiable floor:** compression is a FORMAT constraint, never a content constraint. No
intensity level caps the number of findings, controls, or AC results reported at any severity —
brevity is never a reason to merge, downgrade, or drop a finding. This floor is orthogonal to
every level below.

---

## 2. Intensity Levels

Every full-lane artifact maps to exactly one of these four levels. Each level is defined by an
explicit, non-overlapping artifact-class list — an artifact belongs to the level its class
appears under, not to a level chosen ad hoc per document.

| Level | Definition | Artifact classes |
|-------|-----------|-------------------|
| `verbatim` | Never paraphrased, never compressed, reproduced exactly as produced. | Code blocks and diffs; shell commands; file paths and identifiers; exact error/exception strings; status-block field names and enum values (e.g. `broke-it`, `could-not-break`, `APPROVE`, `REQUEST_CHANGES`); CWE/OWASP reference tokens (`CWE-{N}`); `file:line` locators. |
| `tight` | A bounded prose budget PER ITEM; the item count is never capped. | Per-finding prose in `security`/`adversary`/`reviewer` pipeline-mode reports — Critical/High findings, per-control entries in adversary's report, reviewer's Critical findings. |
| `bounded` | The overall document or section is a capped, replaceable snapshot — not an accumulating log. | `00-state.md` § Hot Context / § Agent Results; `00-execution-events.md` free-text fields (`summary`, `detail`); `changelog.d/*.md` fragments; `01-plan.md § Decisions for human review` (existing 7-bullet cap); `failure-brief.md` iteration entries (existing 5-10 line contract, see § 4 below). |
| `standard` | Ordinary analytical/explanatory prose — no special compression beyond normal editorial concision. | `01-plan.md § Architecture` / `## Review Summary` narrative; `02-implementation.md`; `03-testing.md`; `docs/*.md` reference documentation; any prose not assigned to one of the three classes above. |

**Reading order for a new artifact:** check `verbatim` first (is this an exact reproduction of
something machine- or human-produced verbatim?), then `tight` (is this a per-item entry in a
findings-first report?), then `bounded` (is this a whole-document/section snapshot?); anything
left over is `standard`.

---

## 3. Verbatim-Preservation Rule

The following are never paraphrased, summarized, or compressed, regardless of the intensity level
assigned to the surrounding document:

- Code blocks, diffs, and configuration snippets.
- Shell commands and their exact flags/arguments.
- Identifiers: variable names, function names, file paths, branch names.
- Exact error strings and exception messages.
- Enum/status tokens read by another agent or the orchestrator (e.g. `adversary_verdict`,
  `incomplete_on_changed_control`, `APPROVE`/`REQUEST_CHANGES`).

Compressing any of the above changes its meaning or breaks a downstream machine read — the rule
exists independently of which of the four intensity levels otherwise governs the document.

---

## 4. Clarity Exemptions

The following are exempt from compression at any intensity level:

- **Security warnings** — a finding's headline AND its actionable remediation, for
  Critical/High-severity findings. "Security warning" is not just the fact of the finding; the
  remediation step that lets the reader act on it is part of the same exemption. A `tight`-level
  budget still applies the per-item prose cap to the DESCRIPTION, but the remediation pointer for
  a Critical/High finding is never truncated to the point of being non-actionable.
- **Irreversible-action confirmations** — any prompt or report line confirming an action that
  cannot be undone (force-push, production migration, secret rotation, destructive delete).
- **Multi-step sequences** — instructions where omitting an intermediate step would make the
  sequence non-reproducible (a recovery runbook, a manual-fallback procedure).

These exemptions apply on top of the intensity-level table in § 2 — a `tight`-level artifact
(e.g. a Critical security finding) still gets the full remediation pointer even though its
descriptive prose is budget-capped.

---

## 5. Iteration Re-Narration Ban

Patch/verify round narratives live in exactly one place: `failure-brief.md`. Every other document
that discusses an iteration references it by ID (`Iteration {N}`) and does not retell what
happened in that round.

**Canonical vehicle to imitate:** `agents/adversary.md:274-291` — the "Failure Brief" section's
5-10 line per-iteration contract (`## Iteration {N} — adversary — {timestamp}`, root-cause type,
blast radius, breaks found, required changes). This is the shape every other agent's
iteration-reference points back to; no other file restates the round's content.

Consumers of this ban (`security`, `adversary`, `reviewer`, `reviewer-consolidator`, `qa`,
`tester`, `acceptance-checker`, `delivery`, `plan-reviewer`, the orchestrator's `00-state.md` and
`00-pipeline-summary.md`) each add a short reference to this section — they do not copy the ban's
text or reproduce the iteration narrative locally.

---

## 6. Before/After Measurement Method

Measure the effect of this contract using the existing `00-pipeline-summary.md § Cost` rollup
(`docs/observability.md § Cost rollup`) as the baseline — no new instrumentation is introduced.

**Method:**

1. For a given feature run, read the `## Cost` section's per-agent token/byte breakdown at
   `pipeline.complete`/`end`.
2. Compare the `security`/`adversary`/`reviewer` report-body byte share (bytes/4 token proxy,
   consistent with the empirical baseline method below) against the feature's total run bytes,
   before and after this contract lands.
3. A run "improves" when the two-lens report-body share drops from its pre-contract baseline
   without a drop in reported finding count (cross-check against the finding count in the same
   run's `reviews/04-security.md` / `reviews/04-adversary.md`).

**Empirical vault-run baseline** (sample taken 2026-07-13/14, bytes/4 token proxy, ~767K
persisted tokens across 6 runs): run sizes ranged from `hotfix-psp` at 79 KB up to
`pipeline-cost-lanes-and-trim` at 1,232 KB. In the largest runs, `reviews/04-security.md` reached
up to 254 KB and `reviews/04-adversary.md` up to 202 KB in a single run — 27% of that run's total
bytes combined. This sample is the reference point for "before"; a re-measurement after this
contract's rollout is the corresponding "after" using the same method.

---

## 7. Multi-Site Invariant

The intensity-level table in § 2 is mirrored — compactly, names and artifact-class assignments
only, no restated rationale — in `agents/_shared/output-template.md § Output Contract —
Compression`. The two tables must never diverge; a future edit to either updates both.
