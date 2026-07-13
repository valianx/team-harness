# Code-Hygiene Gate — Contract and Site Enumeration

> Single source of truth for the Stage-2 code-hygiene contract: the canonical work-narration
> pattern set, the fixed scan command, the operational definition of "source-code comment," and
> the enumeration of every execution site that dispatches or consumes this contract. Sibling to
> `docs/code-comments.md` (the authoring guide this gate enforces) and `docs/testing.md`
> (the structural suite that pins the enumeration below).

---

## 1. Why two layers

`agents/implementer.md § Best Practices — Non-Negotiable → Reviewability` already states the
comment contract (WHY-only, no work-narration, caps on function size). Until this gate existed,
compliance depended entirely on the generator's own self-review — no downstream check ever
re-verified it. This gate closes that loop with two complementary layers:

- **Layer 1 — deterministic, mechanical, pre-verify.** A fixed `git diff` + `grep -E` scan that
  the orchestrator runs once per task, before the parallel verify block opens. No judgment, no
  model call — a script decides.
- **Layer 2 — judgment, holistic, in-verify.** `qa` (validate mode) audits the same diff for
  violations a mechanical scan cannot catch: over-cap functions without a documented exception,
  WHAT-restating comments, dead code, magic numbers.

Both layers consume the same pattern set and the same operational definitions defined in this
file — one source of truth, never two independently-maintained copies.

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

The set the implementer contract already forbids (`agents/implementer.md` Reviewability bullet):
references to `workspaces/` paths, pipeline phase/stage/step tokens used as narration, task- or
issue-ID narration, and session-context phrasing.

### 3.1 Fixed scan command (pinned, copy verbatim)

Both layers reference this exact command as the ground truth for "what counts as a violation."
Run against the packet's `Base ref` (`00-verify-packet.md § Base ref`), scoped to the task's
diff:

```
git diff --unified=0 "${BASE_REF}"...HEAD -- . \
  ':(exclude)*.md' ':(exclude)*.markdown' \
  ':(exclude)*.rst' ':(exclude)*.txt' ':(exclude)*.adoc' \
| grep -E '^\+' \
| grep -v '^\+\+\+' \
| grep -E '^\+[[:space:]]*(//|/\*|\*|#|<!--|--|;)' \
| grep -E \
  -e 'workspaces/' \
  -e 'Phase [0-9]' \
  -e 'Stage [0-9]' \
  -e 'Step [0-9]' \
  -e 'STAGE-GATE' \
  -e 'per Step' \
  -e 'added for issue' \
  -e 'issue #[0-9]' \
  -e 'task-[0-9]' \
  -e 'per operator instruction' \
  -e 'in this run' \
  -e 'workspace note'
```

**Pipe stages, in order:** (1) diff against base, prose extensions excluded via pathspec; (2)
added lines only (`^+`); (3) drop the `+++` file-header line; (4) comment-leader lines only —
this is the operational definition from § 2, mechanized; (5) the canonical work-narration
alternation.

**Exit-code contract.** The final `grep` exits `1` (no lines matched) on a clean diff, `0` (lines
matched) on a violation, or `2`+ on a genuine error (malformed regex, missing file). Treat exit
`2`+ as an **escalation**, never a silent pass — a broken command must not be misread as "no
violations found." Because `git diff` sits at the head of the pipe, wrap the invocation with
`pipefail` (or check `git diff`'s own exit status independently before trusting the grep chain's
exit code) — otherwise a failing `git diff` produces empty input that every downstream `grep`
reads as "zero matches," masking the real failure as a false-clean scan.

**File:line resolution.** The pinned command above resolves WHICH lines violate the pattern set;
resolving the exact `file:line` for the failure brief is a standard unified-diff line-tracking
step layered on top (track the current file from each `+++ b/<file>` hunk header and the running
`+`-side line counter from each `@@ -a,b +c,d @@` hunk header, incrementing once per matched `+`
line). That resolution script is dispatch-time tooling, not a pinned literal — only the match
command above is fixed and testable.

---

## 4. Layer 1 — Phase 2.6 Code-Hygiene Scan (deterministic)

**Owner:** `agents/orchestrator.md` — not a subagent dispatch, a Bash gate the orchestrator runs
itself (same shape as the Phase 2-close scope check and Phase 3.75 build verification).

**When:** between Phase 2.5 (Constraint Reconciliation) and Phase 2.7 (Test Authoring), for
every `type` (`feature`/`fix`/`refactor`/`enhancement`/`hotfix`) — no skip condition beyond the
existing operator-declared fast-path mechanisms.

**Verdict handling:**

| Result | Action |
|---|---|
| Clean (final `grep` exits `1`) | Emit a structural trace event only (`stage2.hygiene`, `verdict: pass`) — **never operator-facing prose**. Advance to Phase 2.7. |
| Violations found (final `grep` exits `0`) | Emit `stage2.hygiene` (`verdict: fail`, `extra: {files, count}`). Write a `failure-brief.md` iteration entry with `Blast radius: localized {file:line, ...}`. Re-dispatch `implementer` under the BOUNDED-PATCH contract (`agents/implementer.md § BOUNDED-PATCH contract`). Rebuild the verification packet. Re-run the scan only (not the full verify block). |
| Command error (final `grep` exits `2`+, or `git diff` itself failed) | Escalate — do not advance and do not silently treat as clean. Surface to the operator. |

**Iteration budget:** shares the existing max-3 cap for Case A (implementation) bounces —
see `agents/orchestrator.md § If any agent fails → ITERATE`.

**`workspaces/` exclusion is structural, not filtered.** The workspaces directory is git-ignored
(local mode) or lives outside the repository entirely (obsidian mode) — it never appears in
`git diff` output, so no explicit pathspec exclusion is needed for it. The prose-extension
exclusion in § 2 covers committed `.md` files under `docs/`/`agents/`/`skills/`.

---

## 5. Layer 2 — `qa` Code Hygiene audit (judgment)

**Owner:** `agents/qa.md`, Phase 3, validate mode — a mandatory `## Code Hygiene` section in
`reviews/04-validation.md`, in addition to the existing per-AC verdicts.

**Scan target:** the same task-diff resolution `qa` already uses for AC evidence
(`git diff --name-only` against the packet's `Base ref`) — no additional tree read.

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

**Status-block field:** `code_hygiene: pass | fail`. `fail` when **any** unjustified finding
exists in categories 1-5 above. On `fail`, `qa` appends the hygiene findings to
`failure-brief.md` as their own block, separate from failing-AC findings, with a
`Blast radius: localized {file:line}` or `structural` declaration per the existing failure-brief
contract.

---

## 6. Byte-consistency requirement (AC-5)

The Layer-2 cap-exception gate wording is **"explained or under cap"** — this exact phrase must
appear both in `agents/implementer.md § Reviewability self-check` (the producer of
`02-implementation.md § Reviewability Exceptions`) and in `agents/qa.md § Code Hygiene` (the
consumer that decides whether an over-cap function is a finding). A drift between the two
wordings is a structural defect — `tests/test_agent_structure.py` pins both sides.

---

## 7. Site enumeration

Every execution path that dispatches or gates this contract, as a separate site class. A
consumer of the `code_hygiene` field enumerated without its producer (or vice versa) is a
false-green gate by construction — see `docs/knowledge.md` node
`multi-site-contract-all-execution-paths-must-match`.

| Invariant | Site class | File | Anchor / field |
|---|---|---|---|
| Layer 1 scan — primary dispatch path | scan-site A1 | `agents/orchestrator.md` | `## Phase 2.6 — Code-Hygiene Scan` |
| Layer 1 scan — takeover/inline path | scan-site A2 | `docs/subagent-orchestration.md` | Takeover Pipeline Manifest (inviolable gates list) |
| Layer 1 scan — special-flow pointers | scan-site A3 | `agents/ref-special-flows.md` | Bug-fix Flow / Milestone-Build Flow (pointer only — never replicates the command) |
| `code_hygiene` PRODUCER | producer B1 | `agents/qa.md` | `## Code Hygiene` audit + Return Protocol `code_hygiene:` field |
| `code_hygiene` CONSUMER — Phase 3 gate | consumer C1 | `agents/orchestrator.md` | `### Phase 3` worst-of combined verdict (conjunction) |
| `code_hygiene` CONSUMER — Phase 3.5 gate | consumer C2 | `agents/orchestrator.md` | `## Phase 3.5 — Acceptance Gate` (defensive re-assertion) |
| `code_hygiene` CONSUMER — iteration routing | consumer C3 | `agents/orchestrator.md` | `### If any agent fails → ITERATE` (Case A) |
| Observability | event | `agents/orchestrator.md` (event enum) + `docs/observability.md` | `stage2.hygiene` |

**Rule for any future edit to this contract:** touching one row of this table without touching
every other row in the same change is the failure mode this gate exists to prevent in the
implementer's OWN output — do not reproduce it in the gate's own maintenance.

---

## 8. Anti-residue discipline

This gate's own artifacts — this file, `agents/orchestrator.md`, and the structural test suite —
must not embed the forbidden literals (`workspaces/` paths, `Phase N`/`Step N` tokens, `issue
#N` narration) as a contiguous string inside a **source-code comment**, or the gate would flag
its own authoring diff (a self-inflicted false-positive that would also mask real violations by
training reviewers to expect noise from this file).

Two structural properties make this safe by construction:

1. **This file is prose (`.md`).** Per § 2, prose-extension files are excluded from the Layer-1
   scan entirely — the pattern alternation in § 3.1 lives inside a fenced `grep` command block,
   and every line of that block starts with `grep`/`|`/`-e`, never a source-code comment leader.
2. **`tests/test_agent_structure.py` is source code (`.py`), not prose.** Any "bad-example"
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
never appears in one) that this gate enforces. See `docs/testing.md` for the structural suite
that pins every row of § 7's site-enumeration table with positive and negative assertions.
