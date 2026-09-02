## Context

See [proposal.md](proposal.md). The repository owns every piece this change composes: `tests/test_authoring_budgets.py` with its shrink-only `EXEMPT` map, `/th:lint` Check 12, `openspec validate --strict`, the v5 Design steps in `agents/ref-pipeline.md`, and the deterministic helpers under `skills/`. The change adds no mechanism family; it points the existing ones at growth.

## Goals / Non-Goals

**Goals:**

- Make "simpler" a number a test compares against a recorded value, from real runs.
- Make the contract corpus unable to grow without an explicit, reviewed lowering of a ceiling.
- Keep decision procedures out of prose once helpers own them.
- Stop the architect before it produces a plan the operator cannot review in one sitting.
- Keep `openspec/changes/` for product behavior only.

**Non-Goals:**

- Touching the v5 control plane, its helpers, or the failure table in `ref-pipeline.md § Failures`.
- Deleting behavior. Every retired paragraph is a restatement of a helper that stays.

## Decisions

### 1. Shrink-only fixture instead of a PR-diff check

`tests/fixtures/authoring-baseline.json` records `{ "<path>": { "ceiling": <words>, "target": <words> } }` for every `agents/ref-*.md` and `agents/_shared/*.md` file over its class budget. The suite fails when a file exceeds its `ceiling`, and fails when a recorded `ceiling` sits more than 2% above the current count, so a lowered file forces the fixture down. This generalizes the existing `EXEMPT` ratchet, which today records only membership, not a number.

Targets: `ref-special-flows.md` 6,000, `ref-direct-modes.md` 4,000, every other reference at its class budget. A PR-diff check was rejected: tests cannot see the diff, and CI-only enforcement lets local runs drift.

### 2. Retired-phrase lint instead of semantic parity

Lint gains a closed phrase list marking a decision procedure restated in prose: `classify-agent-failure` with its flag enumeration, `retry-contract`, `agent-contract-invalid`, `absent after retry (agent contract)`, `--attempt {1|2}`. A hit in `agents/**` or `skills/**/SKILL.md` fails Check 12 with file and phrase named. Today the hits are four in `ref-direct-modes.md` and six in `review-pr/SKILL.md`; the first is fixed here, the second by `verify-review-findings`, so this change lands the lint rule with the review skill temporarily exempted and that exemption removed when the review change merges.

### 3. Real-run baseline, distinct from the contract benchmark

`test_pipeline_simplification_benchmark.mjs` stays: it proves helper-operation counts against fixture data without a model. `docs/benchmarks/pipeline-baseline.md` records what it cannot: three fixture requests run through the live pipeline on 3.20.14, with time to Gate 1, architect and specialist dispatches, tool calls, acceptance-criteria count, correction rounds, terminal state, and exclusive defects per lens, against a named tree anchor. A change that alters dispatch, state, or recovery contracts compares against this file.

### 4. Ceiling by requirement count, decided live

`openspec/config.yaml` records `max_requirements_per_change: 12`, enforced by `tests/test_openspec_scope.py` on every active change and read by the architect during v5 Design step 3. When the authored delta exceeds it, the architect returns `design_status: oversize` with the count and the split seams it sees, and the coordinator presents before step 4:

```text
1 — split into N changes (architect proposes the seams)
2 — accept oversize: <reason recorded in proposal.md>
3 — narrow the request
```

The decision is a `design.oversize` event. A time ceiling was rejected as the trigger: the design SLA already fires and is correctly not failure authority. Count is what the operator reads. Twelve is the healthy archived maximum (5–9) with headroom; it is configuration, not doctrine.

### 5. A change exists only for a capability

`tests/test_openspec_scope.py` fails when an active change's `specs/` is empty or its proposal declares no new and no modified capability. `install-agnix-cli`, `deliver-pr-review-contract-recovery`, and the superseded `repair-legacy-v1-migration-dispatch` are removed, not archived: archiving would write a capability that does not exist. The six completed changes are archived so the main specs match the shipped code.

### 6. CLAUDE.md states counts the fixture records

`CLAUDE.md § 14` cites the orchestrator kernel and pipeline reference sizes from the fixture's recorded values, so the document cannot drift from the test again.

## Risks / Trade-offs

- **A ceiling blocks a required enumeration** → `docs/agent-authoring.md` already allows `size_reason: required-items`; the fixture accepts a `reason` field that lint reports and never uses to pass.
- **Retired phrases reappear under new names** → the list is closed and reviewable; the authoring rule ("name the helper and its vocabulary") is the standing defense.
- **The real-run baseline costs three pipeline runs** → once, on a tagged tree. It is the only way to know whether v5 helped.
- **Requirement count is gameable by merging requirements** → the Gate-1 reader sees the proposal; a merged requirement with six scenarios is still one page, which is the property the ceiling protects.
