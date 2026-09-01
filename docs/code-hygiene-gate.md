# Code-Hygiene Gate — Contract and Site Enumeration

> Single source of truth for the Stage-2 code-hygiene contract: the canonical work-narration
> categories, the deterministic helper, the operational definition of "source-code comment," and
> the enumeration of every execution site that dispatches or consumes this contract. Sibling to
> `docs/code-comments.md` (the authoring guide this gate enforces) and `docs/testing.md`
> (the structural suite that pins the enumeration below).

---

## 1. Why two layers

`agents/implementer.md § Comments` and `§ Best Practices — Non-Negotiable → Reviewability`
state the producer contract (WHY-only comments, no work-narration, explained cap exceptions).
Until this gate existed, compliance depended entirely on the generator's own self-review — no downstream check ever
re-verified it. This gate closes that loop with two complementary layers:

- **Layer 1 — deterministic, mechanical, pre-verify.** A versioned helper scan that
  the orchestrator runs once per task, before the parallel verify block opens. No judgment, no
  model call — a script decides.
- **Layer 2 — judgment, holistic, in-verify.** `qa` (validate mode) audits the same diff for
  violations a mechanical scan cannot catch: over-cap functions without a documented exception,
  WHAT-restating comments, dead code, magic numbers.

The versioned pattern implementation lives only in `skills/pipeline/scripts/code-hygiene.mjs`;
this document owns its meaning and lifecycle rather than copying its regular expressions.

---

## 2. Operative definition — "source-code comment"

An added diff line counts as a **source-code comment** when BOTH hold:

1. The file's extension is NOT in the prose exclusion list: `.md`, `.markdown`, `.rst`, `.txt`,
   `.adoc`. Files with these extensions are prose by convention (agent prompts, docs) and a
   heading like `# Phase 2 — Implementation` is structural markdown, not a work-narration
   violation — excluding these extensions makes the harness's own dogfooding safe by
   construction.
2. The first non-whitespace token after the leading `+` is a comment leader for that
   language: `//`, `/*`, `*`, `#`, `<!--`, `--`, `;`.

Anything else — non-comment code, deleted lines, context lines, prose files — is out of scope
for Layer 1. This is a deliberate narrow scope: Layer 1 catches work-narration IN COMMENTS only;
non-comment violations (dead code, magic numbers, over-cap functions) are Layer 2's job, because
they require judgment a fixed pattern set cannot express.

---

## 3. Work-narration patterns (canonical set)

The set the implementer contract already forbids (`agents/implementer.md § Comments`):
references to `workspaces/` paths, pipeline phase/stage/step tokens used as narration, task- or
issue-ID narration, session-context phrasing, and plan-artifact identifier tags (`AC-{n}`,
`TC-{n}`, `SEC-{n}`).

### 3.1 Deterministic helper

Main resolves `code-hygiene.mjs` from the verified workspace helper bundle and invokes it once
with five exact flag/value pairs: `--repo`, `--workspace`, `--base`, `--candidate`, and
`--output`. `--base` is `verification_base_ref`; `--candidate` is the clean current HEAD; and
`--output` is an authorized absolute evidence coordinate below the workspace.

The helper owns pattern versioning, prose exclusions, bounded Git access, file/line resolution,
base ancestry, clean-tree and current-candidate checks, atomic evidence persistence, and terminal
exit status. It always emits one bounded `team_harness_code_hygiene_receipt`; the referenced
schema-v1 result binds repository, base/candidate SHA, diff SHA-256, scanned bytes, pattern
version, and bounded `{path, line, pattern}` violations. Pass exits zero. A violation or any
contract/runtime failure persists a fail-shaped result when the output coordinate is valid and
exits nonzero; exit zero without the receipt and hash-matched result is never evidence.

---

## 4. Layer 1 — Phase 2.6 Code-Hygiene Scan (deterministic)

**Owner:** Main — not a subagent dispatch. The helper and its result schema are the only
mechanical implementation; coordinator prose never reconstructs the scan.

**When:** between Phase 2.5 (Constraint Reconciliation) and Phase 2.7 (Test Authoring), for
every `type` (`feature`/`fix`/`refactor`/`enhancement`/`hotfix`) — no skip condition beyond the
existing operator-declared fast-path mechanisms.

**Verdict handling:**

| Result | Action |
|---|---|
| Receipt/result pass | Record `stage2.hygiene`, `verdict: pass`, its result path/SHA, then continue. |
| `WORK_NARRATION_DETECTED` | Record the fail evidence and add one localized correction finding from its bounded locations. |
| Any other fail, missing receipt, or hash mismatch | Block Freeze as infrastructure/contract failure; never reinterpret it as clean. |

**Correction-round budget:** a hygiene violation consumes one implementation/validation
correction round in the existing max-3 cap and returns through implementation → Freeze →
validation. It does not edit the plan, dispatch `architect`, increment the counter for a
plan repair, or create an `iteration.start` for an operator decision; see
`agents/ref-pipeline.md`.

**`workspaces/` exclusion is structural, not filtered.** The workspaces directory is git-ignored
(local mode) or lives outside the repository entirely (obsidian mode) — it never appears in
`git diff` output, so no explicit pathspec exclusion is needed for it. The prose-extension
exclusion in § 2 covers committed `.md` files under `docs/`/`agents/`/`skills/`.

---

## 5. Layer 2 — `qa` Code Hygiene audit (judgment)

**Owner:** `agents/qa.md`, Phase 3, validate mode — a mandatory `## Code Hygiene` section in
`reviews/04-validation.md`, in addition to the existing per-AC verdicts.

**Scan target:** the same task-diff resolution `qa` already uses for AC evidence
(`git diff --name-only` against state `verification_base_ref`) — no additional tree read.

**What it audits (requires judgment; NOT expressible as a fixed grep pattern):**

1. **Over-cap functions without a documented exception.** A function exceeding 40 lines, 4
   parameters, or 3 nesting levels (`agents/implementer.md § Reviewability`) with no matching
   entry in `02-implementation.md § Reviewability Exceptions` is a finding. A function that
   exceeds a cap **with** a matching entry is NOT a finding — the gate is **"explained or under
   cap"** (see § 6 below for the byte-consistency requirement).
2. **WHAT-restating comments** — a comment that only repeats what the adjacent code already
   says, with no WHY.
3. **Work-narration comments** — the same pattern set as Layer 1 (§ 3), re-checked here as a
   judgment backstop in case a variant phrasing slipped past the fixed pattern set.
4. **Dead code** — commented-out blocks, unreachable branches, unused exports left behind by the
   change.
5. **Magic numbers** — unexplained numeric/string literals that should be named constants.

**Reported as findings.** Each unjustified item is a finding with severity, location and
grounds; `qa` emits no separate verdict field. Whether one holds the ship is decided by the
ordinary severity floor, not by a conjunction of its own. A hygiene finding that does hold
the ship reaches `failure-brief.md` through the same path as every other held finding, with
the same `Blast radius: localized {file:line}` or `structural` declaration.

---

## 6. Byte-consistency requirement (AC-5)

The Layer-2 cap-exception gate wording is **"explained or under cap"** — this exact phrase must
appear both in `agents/implementer.md § Reviewability self-check` (the producer of
`02-implementation.md § Reviewability Exceptions`) and in `agents/qa.md § Code Hygiene` (the
consumer that decides whether an over-cap function is a finding). A drift between the two
wordings is a defect — both sides must be edited together; nothing pins them.

---

## 7. Site enumeration

Every execution path that dispatches or gates this contract, as a separate site class. A
consumer of a field enumerated without its producer (or vice versa) is a
false-green gate by construction — see `docs/knowledge.md` node
`multi-site-contract-all-execution-paths-must-match`.

| Invariant | Site class | File | Anchor / field |
|---|---|---|---|
| Layer 1 scan — primary dispatch path | scan-site A1 | `agents/ref-pipeline.md` | `## Phase 2.6 — Code-Hygiene Scan` |
| Layer 1 scan — takeover/inline path | scan-site A2 | `docs/subagent-orchestration.md` | Takeover Pipeline Manifest (inviolable gates list) |
| Layer 1 scan — special-flow pointers | scan-site A3 | `agents/ref-special-flows.md` | Bug-fix Flow / Milestone-Build Flow (pointer only — never replicates the command) |
| Comment-producer contract — implementer | contract-site D1 | `agents/implementer.md` | `§ Comments` |
| Comment-producer contract — tester | contract-site D2 | `agents/tester.md` | `§ Comments` |
| Observability | event | `agents/ref-pipeline.md` (event enum) + `docs/observability.md` | `stage2.hygiene` |

**Rule for any future edit to this contract:** touching one row of this table without touching
every other row in the same change is the failure mode this gate exists to prevent in the
implementer's OWN output — do not reproduce it in the gate's own maintenance.

---

## 8. Anti-residue discipline

This gate's own artifacts — this file, `agents/ref-pipeline.md`, and the structural test suite —
must not embed the forbidden literals (`workspaces/` paths, `Phase N`/`Step N` tokens, `issue
#N` narration) as a contiguous string inside a **source-code comment**, or the gate would flag
its own authoring diff (a self-inflicted false-positive that would also mask real violations by
training reviewers to expect noise from this file).

Two structural properties make this safe by construction:

1. **This file is prose (`.md`).** Per § 2, prose-extension files are excluded from the Layer-1
   scan entirely; the executable pattern set lives only in the helper source.
2. **A test file is source code, not prose.** Any "bad-example"
   string the structural suite uses to validate the pattern set MUST be built via string
   concatenation (e.g. `"work" + "spaces/" + "foo.ts:12"`) rather than committed as a contiguous
   literal — and, more importantly, MUST NEVER appear inside a committed `#` Python comment. A
   concatenated string used as a plain code value (test data passed to a function call) is not a
   comment and is out of scope for the scan regardless; the concatenation habit is defense in
   depth, not the load-bearing control — the load-bearing control is "no forbidden literal inside
   a `#` comment."

---

## 9. Cross-reference

See `docs/code-comments.md` for the authoring-side contract (when a comment is warranted, what
never appears in one) that this gate enforces. No structural suite in `tests/` currently pins
§ 7's site-enumeration table, and `docs/testing.md` has no hygiene-suite entry; table
consistency is presently a manual-review discipline, not a mechanically-checked one.
