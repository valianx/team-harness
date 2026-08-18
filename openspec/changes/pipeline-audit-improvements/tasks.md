> Editing mandate for every task below: rewrite affected sections whole (coherent order for the full text), never append patch paragraphs, net word count equal or lower per touched file. Suites anchoring on changed literals migrate in the same task. Runtime projections regenerate in the phase that changes their source.

## 1. Quick Fixes

- [ ] 1.1 Replace the consolidator's `.claude/pr-review-*` draft-path pattern with the `workspaces/pr-review-{number}/` invariant across source agent and adapters, with a source↔adapter parity assertion.
- [ ] 1.2 Reconcile the review lens library with the reviewer contract: declared severity mapping, live anchors only, explicit precedence, corrected body folding.
- [ ] 1.3 Fix Codex config migration so `obsidian_tasks` keeps its object shape, and make the Codex todo path fail with a setup pointer when the folder is unresolvable.

## 2. Quality-Runner Diagnostics

- [ ] 2.1 Split the failure taxonomy: `MANIFEST_ABSENT`, `TIMEOUT`, `SPAWN_FAILED`, bounded `detail` on every validation failure; environment causes distinguishable from candidate defects.
- [ ] 2.2 Validate plan-declared required checks against the manifest at Gate-1 preparation.
- [ ] 2.3 Move cross-checkpoint identity to canonical hashing; tolerate the pipeline's own squash/amend in ancestry checks.
- [ ] 2.4 Adopt a benign-byproduct worktree-cleanliness policy and a configurable internal git timeout.
- [ ] 2.5 Open the command-id list behind hermetic argv validation and add manifest-declared per-command severity tiers with safe defaults.
- [ ] 2.6 Extract the triplicated helpers into one shared module.
- [ ] 2.7 Update `docs/quality-runner.md` and `docs/cleaner-crap.md` to the resulting contract (current drift closed by rewrite, not patched).

## 3. Freeze Quality Collapse

- [ ] 3.1 Rewrite the Implementation/Validation/Freeze sections of `agents/ref-pipeline.md` for one quality run per candidate tree at Freeze; delete the cleaner pre/post transition steps.
- [ ] 3.2 Delete `cleaner-transition.mjs`; keep the overreach allowlist proof as a Freeze postcondition; set CRAP to measure-only.
- [ ] 3.3 Re-point Freeze build/lint verification at `quality.json` with heuristic detection only as manifest-absent fallback.
- [ ] 3.4 Reconcile the recover-in-place contract (#604) with the collapsed checkpoint set.
- [ ] 3.5 Migrate the deterministic suites that anchor on checkpoint names and transition scripts.

## 4. PR-Review Independence

- [ ] 4.1 Add the QA-lens coverage schema (`acs_evaluated`, non-verifiables, `lens_status`), oracle-provenance handling, severity rule, and missing-coordinate blocking.
- [ ] 4.2 Give the consolidator the frozen worktree coordinate (read-only), the disposition ledger, coordinator count reconciliation, and the published lens-coverage line.
- [ ] 4.3 Rewrite the reviewer contract order (code → draft verdict → thread for dedup), strip Title/Author from the dispatch, move CI status post-verdict.
- [ ] 4.4 Implement preview→publish integrity: verdict-line/event reconciliation, draft hash anchor, `--auto-publish` event and freshness, evidence-first preview.

## 5. Gate Autonomy

- [ ] 5.1 Rewrite `agents/_shared/gate-contract.md`: single approve carrying `release_policy: auto-ship` in the Gate-1 dual record; mechanical Gate 3 citing that record; `approved-autonomous` legacy-legible only.
- [ ] 5.2 Rewrite the Validation→Gate 3→Delivery flow in `agents/ref-pipeline.md` for autonomous correction (max-3) plus auto-ship on total green, with the closed exception list as the only pause source.
- [ ] 5.3 Update `agents/_shared/orchestrator-state.md` and recovery: `{ship, auto-ship}` cleared values; recovery never auto-releases.
- [ ] 5.4 Update `dev-guard` so the recorded ship policy covers the benign push and `gh pr create` only; fix the env-assignment-prefix false positive; all other outward actions unchanged.
- [ ] 5.5 Update `recover`/`deliver`/`pipelines` skills and gate-literal test anchors; regenerate all runtime projections.

## 6. Codex Parity and Workspace Model

- [ ] 6.1 Extend Codex preflight to diagnose project-config shadowing distinctly from stale-session, with the concrete fix message.
- [ ] 6.2 Teach Codex `setup`/`update` to detect shadowing drift and offer the gated operator-level `writable_roots` repair.
- [ ] 6.3 Reconcile the capability contract: registry `command-exec` for review roles, enforced-or-unclaimed allowlists, real-transport fixture-read integration test.
- [ ] 6.4 Move frozen review worktrees under `workspaces/` and prune at flow close.
- [ ] 6.5 Reduce Codex PreToolUse wiring to the deny floor; `gate-guard` unwired or opt-in with only the `auto-ship` literal update.
- [ ] 6.6 Implement the repository-local canonical workspace with one-way Obsidian export (`obsidian_sync` states, recovery reads repo only, `obsidian-direct` opt-in behind the probe).

## 7. Agent Authoring Standard

- [ ] 7.1 Write `docs/agent-authoring.md` (skeleton, budgets, rules, PR checklist) and bind it from CLAUDE.md and `agent-builder`.
- [ ] 7.2 Add the `/th:lint` structure checks: budgets, description format, tools allowlist, reference depth, dangling anchors, TOC.
- [ ] 7.3 Add the semantic↔adapter parity check to the projection verification suite.
- [ ] 7.4 Rewrite `agents/architect.md` to budget; validate with the behavioral suite plus a trial pipeline run.
- [ ] 7.5 Rewrite `agents/plan-reviewer.md`, `agents/security.md`, `agents/qa.md`, then `agents/_shared/orchestrator-state.md` and `agents/_shared/gh-fallback.md`, same validation per file.

## 8. Verification and Release

- [ ] 8.1 Run the full free verification and behavioral suites plus the Codex projection suite; record suite evidence.
- [ ] 8.2 Execute one end-to-end pipeline on a fixture repo exercising single-approve → autonomous correction → auto-ship draft PR, and one Codex-runtime review flow.
- [ ] 8.3 Apply version and changelog updates per the internal distribution rule.
