## Why

The 2026-08-17 pipeline audit catalogued ~70 blocking points and measured the cost of the current posture: 8 of 9 recorded quality-stack blockage episodes were spurious, the PR-review flow carries correctable bias defects, the Codex runtime failed on a diagnosable configuration root cause (project config shadowing global writable roots), and several instruction files exceed the size at which instruction-following measurably degrades. The operator ratified three directives: after Gate 1 approval, no human intervention until the draft PR exists; the autonomous flow is the only flow (the approve/approve-autonomous duality is an anomaly); iteration belongs on the final result, never on the plan.

## What Changes

- Gate 1 offers a single `approve` that always carries bounded autonomous correction (max-3) and an auto-ship-to-draft-PR release policy recorded in the Gate-1 dual record; Gate 3 becomes mechanical execution of that recorded decision, pausing only on a closed exception list. Merge authority stays human.
- Quality checkpoints collapse to one quality run at Freeze. Cleaner transitions and CRAP enforce retire together; the per-task red→green test contract and the cleaner-overreach allowlist proof survive as Freeze postconditions.
- The quality-runner failure taxonomy becomes diagnosable (absence ≠ invalidity, timeout ≠ regression, bounded detail) and its catalogued spurious-blockage generators are fixed.
- The PR-review flow's bias defects are corrected: consolidator draft paths and adjudication evidence, QA-lens coverage honesty, reviewer reading order and coordinate-only payload, lens-library reconciliation, preview→publish integrity.
- The Codex runtime reaches parity: sandbox preflight distinguishes config shadowing from stale sessions, setup detects and repairs the drift, review worktrees move inside the workspace, the declared capability contract matches effective capability, and hook wiring drops process enforcement Claude Code already retired.
- Pipeline workspaces become repository-local canonical state with a one-way, non-authoritative export to the Obsidian vault.
- Agent authoring gets a canonical standard — structure skeleton, size budgets, parity between semantic contracts and runtime adapters — enforced by `/th:lint` and applied through staged rewrites of the oversized files.

**Editing mandate (applies to every task):** when a contract file changes, rewrite the affected section as a whole so the full text reads in one coherent order; never append patch paragraphs to existing prose; target net prose reduction in every touched file.

## Capabilities

### New Capabilities

- `gate-single-approve-autonomy`: one Gate-1 approve carrying autonomous correction and the ship policy; mechanical Gate 3; closed exception list; recovery compatibility.
- `freeze-quality-run`: exactly one quality run per candidate tree at Freeze; coupled retirement of cleaner transitions and CRAP enforce.
- `quality-runner-diagnostics`: actionable failure taxonomy and removal of spurious-blockage generators in the deterministic quality stack.
- `pr-review-independence`: bias-resistant PR review — coverage honesty, evidence-based consolidation, anchoring-free reviewer contract, reconciled lenses, publish integrity.
- `codex-runtime-parity`: Codex sandbox diagnosis, capability-contract reconciliation, workspace-contained worktrees, reduced hook wiring.
- `workspace-canonical-local`: repository-local canonical pipeline workspace with one-way Obsidian export.
- `agent-authoring-standard`: authoring skeleton, size budgets, semantic/adapter parity checks, staged rewrites.

### Modified Capabilities

None.

## Impact

- Rewrites (whole-section) the gate, validation, delivery, and recovery portions of `agents/ref-pipeline.md`, `agents/_shared/gate-contract.md`, `agents/_shared/orchestrator-state.md`, and `agents/_shared/delivery-mechanics.md`; updates `dev-guard` to honor the recorded ship policy.
- Deletes `cleaner-transition.mjs`; re-points Freeze verification at the `quality.json` manifest; extends `quality-runner.mjs`/`bounded-command.mjs` failure codes.
- Edits the PR-review skill, `reviewer*`/`pr-review-*` agents, and the review lens library; adjusts the Codex projection (instructions, generator, hooks wiring) and regenerates all runtime projections.
- Adds `docs/agent-authoring.md` and `/th:lint` structure checks; rewrites the oversized agent files in stages.
- Updates the deterministic test suites whose anchors assert current gate literals and checkpoint names.

## Non-goals

- No changes to the OpenSpec design integration merged in #602; it is evaluated after real pipeline runs, under the same audit criterion.
- No weakening of `policy-block`/`dev-guard`/`gcp-guard` floors, `base_sha`/Freeze anchoring, or the security-review floor; no new process guards of any kind.
- No change to merge authority or outward-action approval rules.
