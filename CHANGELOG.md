# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.48.0] - 2026-06-03

### Added

- `th:clickup` skill — § "Comments": comments are written from the functional side (effect for end user / SAC / operations), not implementation detail; PR references are secondary. Posted once and correct because the MCP exposes only create/read (`clickup_create_task_comment`, `clickup_get_task_comments`) — no edit, no delete. Never claim "attached/evidence" unless an attach call returned success. (#234)
- `th:clickup` skill — § "Evidence / attachments": documents that the agent cannot reliably attach local files (`clickup_attach_task_file` accepts only base64 inline — ~28k+ chars for a legible screenshot, not transcribable without corruption — or an http(s) `file_url` — public upload leaks PII). Correct path: operator drags the file in ClickUp, or supplies a PII-safe https URL. (#234)
- `th:clickup` skill — § "Closing a ClickUp-originated task — mandatory": every task started via `task <id>` or routed from a ClickUp task into the pipeline MUST be closed with a single functional comment on that task at completion. Mirrored as a pipeline-side step in `orchestrator.md` Phase 5 for ClickUp-origin tasks. (#234)
- `th:clickup` skill — § "Transient-error retry policy": 5xx / 502 Cloudflare / connection-reset errors are retried 1–2 times with backoff before surfacing; real errors (4xx, validation, not-found, auth) are still surfaced verbatim with no retry. (#234)
- `th:clickup` skill — § "Available-states discovery": `clickup_get_list` does not return a list's status set; discover it by calling `clickup_filter_tasks` with `include_closed: true` and collecting the distinct `status` values, then set the exact discovered string via `clickup_update_task`. (#234)

### Changed

- `th:clickup` skill — `tasks` error handling and § "Important" refined: the "no silent retries / surface verbatim" rule now applies to real errors only; transient infrastructure errors follow the bounded-retry policy. Added a top-level-context note (ClickUp MCP ops run at top level, not inside a subagent, where the connector can report "Failed to connect"). `clickup_get_task_comments` and `clickup_attach_task_file` added to the "MCP tools used by this skill" list. (#234)

## [2.47.6] - 2026-06-03

### Fixed

- Pipeline race condition in Phase 3: `tester` and `qa` no longer parallelize over a partially-written test tree. AC-test authoring is moved to a new pre-verify sub-phase (Phase 2.7 — Test Authoring) in Stage 2; the Phase 3 tester is now run-only (executes the frozen suite, does not write AC tests). Regression-locked by a new structural Suite (Suite 52). (#232)

## [2.47.5] - 2026-06-02

### Fixed

- Orchestrator nested-context inline-fallback no longer self-runs or defers the Stage-1 plan-review panel (incl. the security design-review); both stale reviewer sites now emit a dispatch_handoff, closing a security-gate-integrity bypass. Regression-locked by a new structural Suite (Suite 51).

## [2.47.4] - 2026-06-02

### Added

- Roadmap document (`docs/roadmap.md`) — the sequenced path toward the vision; linked from README.

## [2.47.3] - 2026-06-02

### Changed

- Reframed the philosophy doc into a vision document (`docs/vision.md`), covering the destination and the two-level team model (each developer's agent team, and the developers as a shared human team); removed `docs/philosophy.md`.

## [2.47.2] - 2026-06-02

### Added

- Philosophy document (`docs/philosophy.md`) stating the collaborative developer + agent-team model; linked from README.

## [2.47.1] - 2026-06-02

### Changed

- docs(claude-md): offload §5 observability/bug-fix detail, §7b hygiene tables, and §7 Voice examples to docs/ — recovers ~4 KB of headroom under the 36 KB durable guard (pure relocation, zero behavior change).

## [2.47.0] - 2026-06-02

### Added

- `docs/spec-coauthoring.md`: full Phase E2 contract — spec co-authoring (`00-spec-seed.md`, 4 optional prompts + `survey_scope_hint`, marks `dev-seed`/`architect-rigorization`), bidirectional dissent (`### Architect Dissent on Seed` in `01-plan.md § Review Summary`), and approach checkpoint (Variant B: architect emits `approach_freedom: high|low` in status block; orchestrator auto-confirms on `low`, emits one lightweight STOP on `high`).
- Spec co-authoring in `orchestrator.md`: Step 6f (spec-seed offer after intake survey), Phase 0b Step 5 payload now includes `spec_seed` pointer + `scope_hint`, Phase 1 dispatch includes seed-consumption and approach-first instructions, Phase 1 gate reads `approach_freedom` + `spec_seed_dissent` from architect status block.
- Approach checkpoint (Variant B) in `orchestrator.md`: Phase Checklist `1.0-approach-check` non-blocking item; orchestrator auto-confirms on `approach_freedom: low`; emits lightweight STOP on `high`; `approach_checkpoint: {auto-confirmed|confirmed|adjusted}` field in `00-state.md`.
- Spec co-authoring §10 in `docs/discover-phase.md`: seeding offer after intake survey, `00-spec-seed.md` artefact format, 4 E2 hard invariants (HI-E2-1..4).
- Bidirectional Spec Feedback Protocol in `agents/architect.md`: Channel 1 (constraint→spec via `[CONSTRAINT-DISCOVERED]`) + Channel 2 (dissent on seed via `### Architect Dissent on Seed`); `approach_freedom` + `spec_seed_dissent` status-block fields; approach-first contract in Phase 2.
- Dissent check in `agents/plan-reviewer.md` Rule 6: when `spec_seed_dissents: true`, verifies `### Architect Dissent on Seed` is present; no-op when no seed or no dissent (no false positive).
- `Spec-seed:` conditional line in `agents/delivery.md` PR body template, below `Intake survey:`; same prohibition as `Intake survey:`.
- 3 new `00-state.md` fields: `spec_seed_present`, `spec_seed_dissents`, `approach_checkpoint`.
- `CLAUDE.md §5` pointer folded into the existing Discover bullet (E1+E2 together, `docs/spec-coauthoring.md` pointer, Discover bullet header updated); CLAUDE.md stays at 35,999 bytes (strictly under the 36,000 cap).

### Changed

- `agents/architect.md` `01-plan.md` schema: `### Architect Dissent on Seed` (optional, mandatory when dissenting) and `### Proposed Approach` added to `## Review Summary` template.
- `agents/orchestrator.md` `00-state.md` template: 3 new fields (`spec_seed_present`, `spec_seed_dissents`, `approach_checkpoint`) and updated Recovery Instructions.

## [2.46.0] - 2026-06-02

### Added

- `docs/discover-phase.md`: full Discover phase contract (Fase E1 of the pipeline-collaboration-cost-redesign program): default patient-by-default intake disposition, fast-path for clear tasks, advance signal definition (3 forms), intake survey with 4 attributable meta-decisions, 7 new `00-state.md` survey fields, observability (`phase: "0-discover"` events), PR `Intake survey:` line, and 6 hard invariants (HI-1..HI-6).
- Discover phase disposition in `orchestrator.md` Step 6d/6e: architect fires only on explicit advance signal; intake survey captures shape/effort/autonomy/scope-hint as attributable `00-state.md` answers before Step 7; survey never writes `security_sensitive`; path-pattern auto-escalation remains input-independent of all survey answers.
- 7 new `00-state.md` fields: `discover_state`, `advance_signal`, `survey_pipeline_shape`, `survey_effort`, `survey_iteration_autonomy`, `survey_scope_hint`, `survey_source`.
- Conditional `Intake survey:` line in `delivery.md` PR body template (Step 11.2), enumerating shape/effort/autonomy/scope-hint/source — never includes `security_sensitive`.

## [2.45.0] - 2026-06-02

### Added

- `docs/patch-mode.md`: full patch-mode contract (blast-radius classification, BOUNDED-PATCH producer contract, selective verifier re-run matrix, mandatory coherence gate, stateless-dispatch honesty limit, post-compaction recoverability, Phase C precedent).
- Suite 50 (`patch-mode-iteration-contract`, 8 structural checks) in `tests/test_agent_structure.py`: asserts Blast radius in the 3 verifier templates, qa-plan.md exclusion, mandatory coherence gate, and `structural → Never narrow` invariant. Uses `_window_around` anti-false-green helper.

### Changed

- Patch mode + selective verifier re-run (Phase D): verifiers declare `**Blast radius:** localized {IDs} | structural` in `failure-brief.md`; orchestrator applies BOUNDED-PATCH to producers and re-runs only the affected verifier domain; mandatory coherence gate after every localized patch; `extra.blast_radius` added to `iteration.start` JSONL schema; full contract in `docs/patch-mode.md`.

## [2.44.0] - 2026-06-02

### Added

- New `qa-plan` agent (`agents/qa-plan.md`, model: opus, effort: high, read-only tools): carries the pre-code QA modes (ratify-plan, define-ac, reconcile, plan-review panel substance-reviewer) that previously lived in `qa.md`. Producer/gate asymmetry rationale: ratify-plan gates the opus architect (warrants an opus gate); validate gates a sonnet implementer (sonnet gate is balanced).

### Changed

- `agents/architect.md`: `effort: max → high` — MEASURED + REVERTIBLE quality bet (operator-accepted, option B). Revisit with Phase B cost surface once baseline runs accumulate; revert to `max` if Phase 3 iterations or plan-reviewer findings increase measurably.
- `agents/documenter.md`: `model: opus → sonnet` — document-transform work (not design); effort `high` preserved.
- `agents/init.md`: `model: opus → sonnet` — discover-and-document work; effort `medium` preserved. Resolves opus/medium pairing inconsistency.
- `agents/tester.md`: `effort: medium → high` — adversarial regression test reasoning; model `sonnet` preserved. Cost impact is negligible (sonnet).
- `agents/qa.md`: reduced to post-code modes only (validate, pr-review-qa, docs-validation, review); `model: opus → sonnet`, effort `high` preserved. 16 dispatch sites rewired from `qa` to `qa-plan` for pre-code modes; `**Substance (qa):**` panel label preserved unchanged.

## [2.43.0] - 2026-06-02

### Added

- Cost rollup surface (Phase B of the pipeline-collaboration-cost-redesign program): `00-pipeline-summary.md` now includes a `## Cost` section (total tokens, total cost, per-agent and per-phase breakdown with `%`); the `## Phase Timeline` table adds a `Tokens` column; the TL;DR line includes `~${cost}` as a key number. Cost is derived from `phase.end` tokens × a versioned `pricing` table in `~/.claude/.team-harness.json`; `(~)` marks estimated values.
- `/th:trace --cost` flag: prints a per-agent and per-phase cost table with `$` amounts from the `pricing` config key; dual-format `.md`/`.jsonl` detection with `jq` + `python3` fallback; fails soft to tokens-only with `price table not configured — showing tokens only` when the pricing key is absent or malformed.
- Accumulated cost line in all three STAGE-GATE STOP-block templates (`Accumulated cost: ~{N}K tokens (~${X}) (or: price table not configured)`), surfacing run cost at every human review point.
- Versioned `pricing` table format: a namespaced `pricing` key in `~/.claude/.team-harness.json` with `opus.input`/`opus.output`/`sonnet.input`/`sonnet.output` per 1M tokens and an `updated` field. Full spec in `docs/observability.md § "Cost rollup"`.

### Tests

- Suite 49 (`cost-rollup-surface`, 6 structural checks) added to `tests/test_agent_structure.py`: asserts `tokens` is declared REQUIRED (not optional) for `phase.end` in the Phase Transition Protocol and JSONL schema table; asserts `"tokens":0` is FORBIDDEN; includes anti-false-green anchor verification and self-referential guards. Registered in `docs/testing.md`. Total assertions: 1264 (was 1249).

## [2.42.1] - 2026-06-02

### Fixed

- Reconciled the tokens-required-vs-optional contradiction in the Phase Transition Protocol: `tokens` (total integer) is now REQUIRED on every `phase.end`; the silent escape `"tokens":0` is FORBIDDEN; the estimation heuristic (`duration_min × 1500` opus / `× 800` sonnet) is the mandatory fallback when Agent()/Task() metadata is absent, and `tokens_estimated:true` marks estimated values.
- Relocated the heuristic formula from the deprecated `Pipeline Metrics` section to the live Phase Transition Protocol and JSONL schema table; the deprecated section now contains only a cross-reference.

### Changed

- Takeover Pipeline Manifest (`docs/subagent-orchestration.md`) now explicitly declares the token-emission obligation for takeover-dispatched agents: apply the heuristic when `Task()` does not expose `total_tokens`, emit `tokens_estimated:true`, and never write `tokens:0`.
- CLAUDE.md §5 "Pipeline observability is mandatory" now names `tokens` as an explicit requirement of every `phase.end`, including the takeover case (estimated + marked).
- Stacked PRs (child branch off a parent PR's branch) are now explicitly prohibited across the agent system: `architect.md` reframes the default (single-repo long tasks → 1 PR, many commits), adds a situation→shape table, and adds a `Base:` field (default `main`) to the per-PR schema; `delivery.md` adds the named stacking prohibition and a serial-merge contract for multi-PR plans (open PR-N+1 only after PR-N lands, branch from updated `main`, rebase before merge); `plan-reviewer.md` adds Rule 9 (severity `fail`: any declared `Base:` ≠ `main`, or a service split without a valid closed-list reason) with coherent updates to the Verdict Calibration table, the report Summary table, the Findings block, and the Return Protocol; `orchestrator.md` adds a note distinguishing DAG implementation order (parallel worktrees per round) from merge order to `main` (always serial, governed by `delivery.md`).

## [2.42.0] - 2026-06-01

### Added

- `/th:report-issue` — standalone skill to file a structured GitHub issue against valianx/team-harness, with a confirmation gate, duplicate check, Type→label mapping, and gh→curl→paste fallback. Does not route through the orchestrator.

## [2.41.0] - 2026-06-01

### Changed

- Renamed three skills to eliminate collision with Claude Code built-in slash commands: the plugin registers a bare alias (e.g. `/status`) that shadows the native built-in in the menu (confirmed on CC v2.1.159); renaming the folder is the complete canonical fix because the command derives from the folder name, not the `name:` frontmatter. Migration table: `/th:status` → `/th:pipelines`, `/th:memory` → `/th:kg`, `/th:init` → `/th:bootstrap`. The `init` agent (`agents/init.md`) is unchanged; `/th:bootstrap` continues routing to it.

## [2.40.14] - 2026-05-31

### Fixed

- Propagated preserve-in-place semantics to the two orchestrator plan-review execution sites (`agents/orchestrator.md`): the dispatch instruction (~:1238) and the inline-fallback step 4 (~:1268) now instruct the plan-reviewer to preserve the upstream sub-verdicts `**Substance (qa):**` and `**Security design-review (security):**` and rewrite only its own header, Summary table, and `**Combined verdict:**` block — consistent with the canonical contract at :1338 (PR H). Previously both sites ordered "replace section if it exists", which would destroy qa+security sub-verdicts in the takeover/inline path (the least-supervised path).
- Rewritten `agents/documenter.md` provenance step 1 (:154) to locate backing evidence in `00-research.md` (which records the architect-captured source `file:line`) rather than reading the source file directly — consistent with the documenter input contract (:12 NEVER reads code, :148 backing from `00-research.md`, :156 use existing reference). Eliminates the contradiction that left the documenter either violating its sandbox or paralysed.

### Security

- SEC-DR-3 closed: expanded the semantic keyword list (design-review trigger, `agents/ref-direct-modes.md § "Review Panel"`) with five additional high-risk vulnerability classes: `xxe` (CWE-611), `ssti` (CWE-94/1336), `traversal` (CWE-22), `redirect` (open redirect, CWE-601), `cors` (CWE-942 / A05:2025). Plans whose only security indicator is one of these classes now correctly trigger the security design-review via the semantic keyword gate (fail-closed). The summary list (:20) is aligned. `eval`/`exec` remain excluded (false-positive-prone in pipeline prose per `docs/knowledge.md:60`).

## [2.40.13] - 2026-05-31

### Fixed

- Closing cross-pipeline consistency review (post pipeline-flows-hardening): reconciled the orchestrator inline-fallback plan-review procedure (`agents/orchestrator.md`) with the canonical `agents/plan-reviewer.md` closed lists — Rule 1's `Split reason:` list was stale and self-contradictory (listed `OAS bump independence` / `breaking-change isolation`, both INVALID per `plan-reviewer.md`); it now references the canonical closed list (`coexistence window` / `production signal` / `cross-repo deploy gate`) and enforces all 8 rules (was implicitly 1-5), closing a fail-open in the least-supervised takeover path (C-01). Removed two stray `name: deliver` fragments from the `skills/deliver/SKILL.md` body (I-02). Added two anchored guards to `tests/test_agent_structure.py` so the inline-fallback split-reason list cannot re-drift.

## [2.40.12] - 2026-05-31

### Fixed

- Hardened recover/deliver gating and deduped Tier table (PR I — pipeline-flows-hardening, FINAL): `/th:recover` now re-emits any un-cleared STAGE-GATE on resume and never infers gate-cleared status from `next_action` prose — the determination is structural (checklist + `stage.gate.release` events trace); recover is idempotent (skips `[x]` phases, de-dups `phase.*`/`kg_write` appends via structural lookup not regex); dead pointer `00-execution-log.md` → `00-execution-events.{md,jsonl}` fixed in `skills/recover/SKILL.md`; `/th:deliver` direct mode now runs Phase 4.5 (internal review) and emits STAGE-GATE-3 BEFORE any `git push`/`gh pr create` (safe default — no ship-immediately); Tier table deduplicated — canonical source is `orchestrator.md § "Bug tier"`, `ref-special-flows.md § "Tier System"` replaced with a pointer plus a summary of tier names, signals, and auto-escalation rules. Suite 48 (19 anchor-scoped checks, `pr-i-recover-dedup`) added to `tests/test_agent_structure.py`.

### Security

- SEC-002 closed: `--fast` no longer skips the security design-review for security-sensitive scope — a carve-out in the `--fast` skip-set ensures the `security` agent is dispatched in design-review mode within Phase 1.6 when the task is security-sensitive (path/keyword/flag or `type: hotfix` on a sensitive path); the Phase 1.6 in-pipeline security dispatch is now wired (previously only ran via `/th:plan-review` direct mode); the carve-out predicate is identical to the Phase 3 security-sensitive predicate (no asymmetric fail-open); this is additive to the Tier 3+ hotfix floor from PR B.
- SEC-INFO-02 closed: expanded the semantic keyword list (design-review trigger, `ref-direct-modes.md § "Review Panel"`) with seven new high-risk terms: `deserialize`, `unserialize`, `pickle`, `SSRF`, `webhook`, `upload`, `sanitize`; the summary (L20) is aligned; the note clarifies that this list is deliberately broader than Signal 1 (Tier-4 escalation list) — divergence is by purpose, not drift.

## [2.40.11] - 2026-05-31

### Fixed

- Hardened plan-review panel integrity (PR H — pipeline-flows-hardening): reconciled the `plan-reviewer` overwrite/preserve contradiction by redefining the write-mode to preserve-in-place (`**Substance (qa):**` and `**Security design-review (security):**` are never overwritten by `plan-reviewer`); defined a deterministic worst-of combined verdict roll-up (`fail > concerns > pass`, security mapping `clean→pass`/`risks-found→fail`, owner=`plan-reviewer`) so STAGE-GATE-1 reads the `**Combined verdict:**` (not the last sub-verdict); added a vacuous-success guard that blocks the combined verdict from resolving as pass when an expected sub-verdict label is absent (missing-but-expected label → panel incomplete); added direct-mode read-backs for research/diagram modes in `ref-direct-modes.md`. Suite 34 extended by 9 checks (checks 31–39, marker: `pr-h-plan-review-integrity`).

## [2.40.10] - 2026-05-31

### Fixed

- Hardened Documentation Flow fidelity gates (PR G — pipeline-flows-hardening): docs-mode `qa` now spot-verifies a sample of concrete technical claims (endpoints, env vars, config keys, CLI flags, params) against real source files — not just `00-research.md` — and a documented fact with no source backing is a fidelity finding that FAILS the DOC-GATE; `documenter` now requires file:line provenance for every concrete technical claim and returns `blocked` instead of inventing facts when `00-research.md` lacks backing (fail-closed); docs-flow artifacts (`00-research.md`, `02-documentation.md`, `04-validation.md`) registered in the canonical Artifact Verification Protocol table in `orchestrator.md`; DOC-GATE in `ref-special-flows.md` adds a pages-on-disk == `pages_created` existence assertion (mismatch → blocked, fail-closed). Suite 47 (12 anchor-scoped checks) added to `tests/test_agent_structure.py`.

## [2.40.9] - 2026-05-31

### Fixed

- Hardened pipeline observability gates (PR F — pipeline-flows-hardening): Final Pipeline Sanity Check now verifies `00-pipeline-summary.md` and the events file exist + non-empty and contain ≥1 `phase.end` per completed phase (mismatch → `blocked-incomplete`, no `pipeline.complete`); Phase 3.5 Acceptance Gate adds a regression-still-passing check for `type: fix/hotfix` Tier 2-4; Phase 2-close scope check asserts every non-test changed file is in `01-root-cause.md § Scope of Fix` or has `[SCOPE-DRIFT]`; inline `### Emitting kg_write events` pointers added after Phase 3 security-finding write site and Phase 6 save procedure; Documentation Flow observability contract added (`00-execution-events` + `phase.start`/`phase.end` per phase + DOC-GATE gate event + no-KG-capture declaration); Tier 0 explicitly carved out of the CLAUDE.md §5 observability invariant (`workspaces: NONE` by design). Suite 46 (16 anchor-scoped checks, anti-false-green) added to `tests/test_agent_structure.py`.

## [2.40.8] - 2026-05-31

### Fixed

- Fixed `/th:update` step 6 accumulating `CLAUDE.md.bak-*` backups indefinitely by adding a bounded rolling-last-3 prune in both per-OS command blocks (PowerShell: `Get-ChildItem "$claudeMd.bak-*" | Sort-Object LastWriteTime | Select-Object -SkipLast 3 | Remove-Item -Force`; bash: `ls -1t "$CLAUDE_MD".bak-* 2>/dev/null | tail -n +4 | xargs -r rm -f`). Prune runs immediately after each backup creation; delete is anchored exclusively on the resolved path variable glob (`$claudeMd.bak-*` / `"$CLAUDE_MD".bak-*`) — no bare wildcard. Suite 45 (11 anchor-scoped checks, anti-false-green idiom) added to `tests/test_agent_structure.py`.

## [2.40.7] - 2026-05-31

### Fixed

- Fixed `/th:update` corrupting `~/.claude/CLAUDE.md` by moving the three managed blocks (orchestrator-dispatch-rule, nested-dispatch-takeover, voice-rule) from inline fenced copies in `skills/setup/SKILL.md` to canonical source-of-truth files under `skills/setup/managed-blocks/`. Root cause: each `<!-- X:start -->` marker appeared twice in `setup/SKILL.md` (prose occurrence + real block), causing the between-markers extraction to capture instructional prose (`"), append this block:"`) instead of the actual block content. Updated `setup/SKILL.md` Steps 4a/4b/4c to read from the canonical files (read-from-file design, idempotent apply). Updated `update/SKILL.md` step 6 to read the canonical files directly and added exact per-OS command blocks (PowerShell + bash) for catalog refresh, download, and block-sync, declaring the replace as DESTRUCTIVE (marker-presence only, no content comparison). Suite 44 (32 anchor-scoped checks) added to `tests/test_agent_structure.py`.

## [2.40.6] - 2026-05-31

### Fixed

- Hardened `delivery` agent flow (PR E — pipeline-flows-hardening): replaced Glob-first-match version discovery with an explicit 5-site enumeration (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` `plugins[0].version`, `cmd/install/main.go`, `CLAUDE.md §3`, `CHANGELOG.md`) and fenced off the schema top-level; added Step 9e to own the CHANGELOG release cut (gated on Step 9 version bump); updated Step 9b to read `CLAUDE.md §4 Golden Commands` as DoD source and emit `dod: no gates discovered` when all rows are skipped; added Step 2b active `gh` account capture (`gh api user -q .login`) reported as `gh_account:` in the status block; added `blocked-pr-pending` status to `agents/_shared/gh-fallback.md` for the `has_gh=true` push-ok/PR-failed partial-success case. Suite 43 (7 anchor-scoped checks, anti-false-green idiom) added to `tests/test_agent_structure.py`.

## [2.40.5] - 2026-05-31

### Changed

- Re-pointed 9 self-referential test guards (Suites 34–42) from `CLAUDE.md` to `docs/testing.md` as the canonical suite registry, stopping the monotonic §11 growth that was pushing `CLAUDE.md` toward the 40 KB cap with each new suite PR.
- Reduced `CLAUDE.md §11` to a pure 2-line pointer to `docs/testing.md`; all per-suite inventory (Suites 34–42 one-liners) now lives exclusively in `docs/testing.md`.
- Completed `docs/testing.md` canonical registry: added Suites 39, 40, 41, 42 entries (previously listed only in `CLAUDE.md §11`).
- Offloaded §14 routing table and escalation rules to `docs/subagent-orchestration.md § Routing Table and Escalation Rules`; `CLAUDE.md §14` now carries a pointer and the essential universal-rule text only.
- Added structural size-cap `CLAUDE.md < 36000 bytes` guard to `tests/test_agent_structure.py` (durable headroom for PRs E–I); existing `< 40 KB` guard preserved.
- `CLAUDE.md` reduced from 39960 bytes to ~35366 bytes (comfortably under 35 KB).

## [2.40.4] - 2026-05-31

### Fixed

- Wired the dead-letter frontend-scope (ux-reviewer) flow into orchestrator phase bodies and gates (PR D — pipeline-flows-hardening): (1) Added sub-phase 1.7-ux-enrich — a "When frontend_scope: true" sub-block in Phase 1 that dispatches the ux-reviewer in enrich mode after the architect, before Phase 1.5, with input `01-plan.md` and output `01-ux-review.md`; AC pinned into `01-plan.md § Task List` (gate source-of-truth). (2) Added sub-phase 3.4-ux-validate — ux-reviewer validate added to the Phase 3 parallel Task block when `frontend_scope: true`, alongside tester/qa/security, with input `02-implementation.md`+`01-ux-review.md` and output `04-ux-validation.md`. (3) Phase 3.5 UX gate — reads `04-ux-validation.md` when `frontend_scope: true`; any critical (WCAG A) finding fails the gate and routes to the implementer (Case A); high/medium/suggestion findings are recommendations only and do not block. (4) Phase 3.6 input pointers now include `04-ux-validation.md`. (5) Phase Checklist gains frontend_scope-gated entries for 1.7-ux-enrich and 3.4-ux-validate with phase.start/phase.end observability events and [~skipped: frontend_scope:false] markers; ordering note documents that sub-phase numbers mark identity/observability, not execution order. (6) Inline/nested fallback for the ux-reviewer mirrors the plan-reviewer fallback tree; status-block gate reads `findings.critical`. (7) Fixed AC-sink ambiguity in `agents/ux-reviewer.md` enrich mode: AC must be pinned into `01-plan.md § Task List` (gate source-of-truth), not only written to `01-ux-review.md`. Suite 42 (10 anchor-scoped checks, anti-false-green idiom) added to `tests/test_agent_structure.py`.

## [2.40.3] - 2026-05-30

### Fixed

- Corrected three hotfix-flow correctness defects (PR C — pipeline-flows-hardening): (1) Removed the contradictory claim that Phase 1.6 "should have skipped entirely for hotfix" from `agents/plan-reviewer.md:70` and its twin in `agents/orchestrator.md` (renderer section); both files now affirm that Phase 1.6 runs normally for hotfix — Rule 7 no-op, Rule 8 active against `01-plan.md § Task List` — consistent with the canonical `agents/ref-special-flows.md:349`. (2) Split the `bug-not-reproducible` gate-table row in `orchestrator.md § Phase 2.0` by type: `type: fix` keeps the existing "route back to architect" path; `type: hotfix` now auto-promotes to `type: fix` (Tier 3 preserved per PR B clamp), dispatches the architect for a real root-cause, and re-runs Phase 2.0 (operator may override to `status: blocked`). (3) Added an explicit orchestrator-self-authored step for `01-plan.md § Review Summary` and `§ Task List` before STAGE-GATE-1 for hotfix (extending the Tier-1-fix pattern), reflected in `orchestrator.md § STAGE-GATE-1` and `ref-special-flows.md § Modified phases`; amended the STAGE-GATE-1 missing-Review-Summary guard to be type-aware: hotfix and Tier-1-fix route to the self-authored step, never to the architect (which is not dispatched in those flows). Suite 41 (10 anchor-scoped checks, anti-false-green idiom) added to `tests/test_agent_structure.py`.

## [2.40.2] - 2026-05-30

### Fixed

- Closed four fail-open security vectors in the Bug-fix Pipeline (PR B — pipeline-flows-hardening): (1) `type: hotfix` is now pinned to Tier 3 minimum as a hard floor — the auto-classifier and operator overrides `[TIER: 0/1/2]` cannot lower a hotfix below Tier 3 (SEC-D1 override-clamp); `ref-special-flows.md § Hotfix sub-flow` updated to justify the security-always rule by the Tier-3 pin. (2) Signal 2 "re-evaluate after Phase 1" replaced by a deterministic two-point GATE: Phase 0b (if paths known) and Phase 2-close (`git diff --name-only` vs sensitive-path list → any match forces `tier_promote: 3` + Phase 2.0 re-entry + Phase 3 security). (3) Boot type=null fail-open closed: Takeover Protocol step 4 now mandates classify-first (Phase 0a Step 7) before applying the type-gated manifest when `dispatch_handoff.type` is null; security defaults to RUN while type is unknown; schema-row placeholder "hardened in PR B" replaced by a reference to the hardened step 4. (4) Plan-review direct mode security trigger extended with semantic keyword match (auth, token, jwt, secret, credential, PII, encrypt, session, permission, etc.) in addition to the 7 path globs; security skip now surfaces as an affirmative visible notice (`SKIPPED — no security-sensitive path or keyword detected ... re-run with --security`) instead of a passive line. Suite 40 (14 anchor-scoped checks, anti-false-green idiom) added to `tests/test_agent_structure.py`.

## [2.40.1] - 2026-05-30

### Fixed

- Repaired the nested-dispatch takeover / handoff contract: bound `{next-agent}` to an explicit rule (`th:architect` at boot, phase agent from `00-state.md` mid-pipeline, NEVER `th:orchestrator`); added consume-side guard in `docs/subagent-orchestration.md § Takeover Protocol` step 4 that rejects a malformed `th:orchestrator` agent value; defined the canonical `dispatch_handoff` JSON schema (8-field table + worked example) in a new `## dispatch_handoff Schema` section; wired `dispatch.blocked` event emission (reason + action) in the Dispatch-blocked exit; relabeled the Takeover Pipeline Manifest as a gate manifest with a pointer to the Phase Dispatch table as the authoritative ordered phase sequence; corrected stale `§ 13 "Subagent Orchestration"` cross-reference in `skills/README.md` to `§ 14`; added never-th:orchestrator guard reinforcement line in `skills/setup/SKILL.md` managed block; added Suite 39 structural tests (13 assertions anchored via `_slice_section`). Fixes CWE-691 (infinite bounce), CWE-778 (missing security-relevant event), CWE-636 (type:null fail-open entrenchment note).

## [2.40.0] - 2026-05-30

### Added

- Attribution-scoped scope discipline for the reviewer agent (`## Scope Discipline` section in `agents/reviewer.md`): reading the full repo for impact is preserved; raising findings is restricted to code the PR introduced or caused to break (ripple-effect preserved). Pre-existing issues route to a non-blocking `## Fuera de alcance` section in `review_body` and never affect the review event.
- AI-authored PR review lens in `agents/reviewer.md` Phase 1: existence check (symbol not verifiable = CRITICAL), plausible-but-wrong (input that breaks each non-trivial function), and vacuous-test check (test that only mocks what it tests = CRITICAL). All three checks are attribution-scoped and use context7 for third-party symbol verification.
- context7 tools granted to the reviewer (`mcp__context7__resolve-library-id`, `mcp__context7__get-library-docs`), making the already-present `context7_consult` status line a real capability.
- Agent-level no-publish invariant in `agents/reviewer.md` (`## No-Publish Invariant`): the reviewer never calls any GitHub API write endpoint in any mode; it always returns a draft inline; the skill handles publishing after explicit operator approval. Reconciled the `reviewer.md:12/30/31` contradiction ("decide autonomously" = produce recommended verdict; "never finish silently" = always return a draft).
- Behavioral worktree verification step in `skills/review-pr/SKILL.md` (Step 1.6): trust-tier gate runs first — forks (`isCrossRepository: true`) are excluded from auto-run with a note; same-repo PRs run the repo's existing declared test/build suite against the head SHA; newly-red = IN SCOPE, pre-existing red = OUT OF SCOPE, green = confidence signal. Best-effort: degrades to skip when no runnable command or timeout.
- Attribution guard in `agents/reviewer-consolidator.md` before the any-CHANGES_REQUESTED verdict rule: discards/downgrades CRITICALs whose target the PR did not introduce or affect, with an attribution note.
- Explicit no-publish invariant sentence in `agents/ref-direct-modes.md § Review Mode`.
- Suite 38 (13 anchor-scoped checks) in `tests/test_agent_structure.py` asserting all guardrails structurally; self-referential guard registered in CLAUDE.md §11.

### Changed

- `agents/reviewer.md`: fixed broken pointer `gh-fallback.md § Policy` (dead reference) — repointed to `## Policy-aware review` and `.team-harness/review-policy.md` in the consumer repo.

## [2.39.3] - 2026-05-29

### Added

- `INTEGRATION.md`: a canonical end-to-end guide for the team-harness ↔ context-harness-mcp integration — the canonical `mcpServers` `memory` block (local/hosted/authenticated variants), the 16-tool server contract, end-to-end setup, KG content-policy pointer, and a troubleshooting section keyed to the `kg_write` reason codes from the write-integrity beacon.

## [2.39.2] - 2026-05-29

### Fixed

- Aligned the `/th:memory` skill to the real context-harness-mcp tool surface: renamed `create_entities`→`create_nodes` and removed a documented hard-delete-with-double-confirmation feature that called MCP delete tools the server never exposes (it deliberately exposes no delete on its unauthenticated public endpoint). Hard-delete is now documented as operator-only (Supabase Studio / direct SQL); reversible soft-delete via `mark_superseded` remains the skill's destructive default with confirmation. Suite 35 now scans `skills/**/*.md` (not just `agents/`) against the full 16-tool canonical set, catching this class repo-wide.

## [2.39.1] - 2026-05-29

### Changed

- Consolidated the write-time KG content-policy and dedup-gate contract (previously duplicated across agent prompts) into a single `agents/_shared/kg-write-policy.md` snippet referenced by the two KG-writing agents (orchestrator, delivery); documented best-effort session_id propagation; offloaded the §11 testing-conventions prose to `docs/testing.md` to restore CLAUDE.md headroom under the 40 KB cap. Suite 37 locks the snippet contract. No behavior change.

## [2.39.0] - 2026-05-29

### Added

- Write-Integrity Beacon: every KG write now emits a reason-coded `kg_write` event (`attempted`/`succeeded` counters + closed vocabulary `ok | skipped:mcp-down | skipped:malformed-call | skipped:policy-filtered`) at all three write sites (orchestrator Phase 6 + security-finding; delivery passive capture). `/trace` aggregates them into a one-line "KG writes: N attempted, M succeeded" rollup, so a silently-skipped KG write (the exact failure mode behind the 2.38.2 fix) can never again be invisible. Resilience is preserved — the beacon only records, never hard-fails. Suite 36 (11 anchor-scoped checks) locks the contract.

## [2.38.2] - 2026-05-29

### Fixed

- Aligned agent Knowledge-Graph MCP tool names to the context-harness-mcp contract: renamed `create_entities`→`create_nodes` across architect/orchestrator/qa/security/tester (13 sites) and removed 3 phantom `delete_*` frontmatter grants (the server exposes no delete tool — deletes are operator-SQL-only). These calls had been silently failing (best-effort skip) since the server-side rename, dropping team-memory writes in 5/6 agents. New Suite 35 contract test (subset + zero-bare-token) prevents recurrence; a CI workflow (.github/workflows/test.yml) now gates `tests/run-all.sh` on every PR.

## [2.38.1] - 2026-05-29

### Changed

- Renamed the "session-doc" terminology to "workspace doc" across agents, skills, and docs for consistency with the workspaces convention.

## [2.38.0] - 2026-05-29

### Added

- Enriched `plan-review` direct mode into a three-reviewer panel: `qa` (ratify-plan substance) → `security` (design-review, conditional on security-sensitivity) → `plan-reviewer` (shape + combined verdict, runs last). All findings fold in-place into one `01-plan.md` with zero parallel side-files; one consolidated `## Plan Review` section carries three bold-inline sub-verdicts (`**Substance (qa):**`, `**Security design-review (security):**`, `**Combined verdict:**`) plus a new fifth mode `design-review` in `security.md` that reviews the plan without code. Suite 34 (34 checks) asserts the full centralization contract structurally.

## [2.37.0] - 2026-05-29

### Added

- Selective mid-pipeline KG reads on error and security-finding writes: the orchestrator now performs KG `search_nodes` reads before re-dispatching a correcting agent at Phase 3.6 fail (Cases A/B/D — Case C excluded) and Phase 3.75 fail (build/lint error), passing prior-art to the correcting agent. Separately, Critical/High security findings are persisted to the KG (node types `error`/`pattern`) after the final Phase 3 verify pass, with content-filter + dedup gates. `implementer` and `acceptance-checker` gain a `kg_prior_art: hit:N applied:bool | n/a` status-block field. `security` gains a nested `{name, node_type, remediation_text}` form for `kg_save_candidates` (backward-compatible with bare strings). `delivery` Step 11.5 declares cross-dedup exclusion against `error`/`pattern` security nodes. Suite 33 (18 checks) asserts all nine acceptance criteria structurally.

- Neutral-register voice rule: `/th:setup` now writes a third managed block (`voice-rule`) to `~/.claude/CLAUDE.md`, and `/th:update` keeps it in sync alongside the existing two. The block mandates neutral, standard language and forbids country-specific idioms, regionalisms, and dialect slang in every response, in any language. Suite 18 asserts the block's presence and substance in `skills/setup/SKILL.md` and its sync wiring in `skills/update/SKILL.md`.

- Operator-declared `--fast` mode: the orchestrator now recognizes a literal `--fast` flag (operator-declared only — never auto-set) that runs a lightweight pipeline for very small changes (version bumps, one-line edits). It skips Design, plan review, STAGE-GATE-1, `qa`, and `security`; it keeps Specify, Implement, the `tester` suite no-regression check, Build Verification, STAGE-GATE-3 (the human push gate), and Delivery. Security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of `--fast`. The `orchestrator-dispatch-rule` managed block now advertises the fast path (alongside the existing Simple Mode and `[TIER: N]` declarations) so operators can discover it. Documented in `agents/orchestrator.md` and `agents/ref-special-flows.md § Fast Mode (--fast)`; covered by Suite 18 assertions.

- Session-scoped config override: operators can override `logs-mode`, `logs-path`, `logs-subfolder`, and `clickup.workspace_id` per chat session without modifying the persistent `~/.claude/.team-harness.json`. Precedence: session override > persistent config > built-in default. The resolved config is stored in `00-state.md § Current State` (never written to the persistent file). MCP URLs, API keys, and agent model/effort settings are explicitly excluded (those remain `/th:setup` territory). The ClickUp skill gains a `--workspace` flag for per-session workspace switching. `/recover` re-applies the session override from `00-state.md` when resuming a pipeline. Suite 32 contract tests cover all seven acceptance criteria.

- Output discipline: agents and skills now operate silently during execution and emit a single structured report only on completion or error (Silently On Success, Report Once On Error). Internal tool calls (config reads, file existence checks, verification steps) are no longer narrated to the operator. Observability is preserved via `operation.*` nested events in `00-execution-events.jsonl/md` (`operation.start` / `operation.end` / `operation.error`). Rolled out across `orchestrator`, `architect`, `implementer`, `tester`, `qa`, `security`, `delivery`, `init`, and skills `lint`, `memory`, `setup`, `status`, `trace`. `agents/_shared/output-template.md` provides the canonical output contract; `docs/observability.md` documents the `operation.*` schema. A `/th:lint` guardrail (Suite 31) enforces the contract on every new agent/skill commit.

### Fixed

- Takeover-protocol references in the managed `nested-dispatch-takeover` block are now plugin-cache-resolvable and prefix-correct. (A) A "Path & name resolution" note resolves the `docs/…` and `agents/…` repo-relative paths via `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`, covering plugin-only installs without a repo clone. (B) The `dispatch_handoff` JSON field `next_dispatch.agent` is now canonically **prefixed** (`th:architect`) — use verbatim for `Task(subagent_type=…)` and strip the `th:` prefix only to derive the agent file path (`th:architect` → `agents/architect.md`). Four dispatch-templates aligned; 8 Suite 18 regression assertions added (989/989 green).
- Nested-dispatch takeover protocol now requires reading a **Takeover Pipeline Manifest** at the start of `docs/subagent-orchestration.md` before executing any stage. The manifest front-loads the complete ordered map of stages and gates (anti-skip), enforces a comply imperative ("skipping any stage or gate is a defect, not a shortcut"), and lazy-loads per-stage detail. The managed `nested-dispatch-takeover` block in `~/.claude/CLAUDE.md` carries the comply imperative inline. Stale session-doc names in steps 6-7 of the takeover protocol (`06-acceptance-check.md`, `05-delivery.md`, `02-task-list.md`) corrected to the current schema (`04-validation.md § Drift Analysis`, `00-state.md`, `01-plan.md § Task List`). Covered by 17 new Suite 18 assertions (911/911 green).

### Changed

- `README.md` Update section now leads with `/th:update` (the recommended command — refreshes catalog, downloads the new version, syncs managed blocks) followed by `/reload-plugins`. The previous two-step `/plugin marketplace update` + reload sequence was incorrect (catalog refresh does not download files); it is demoted to a manual-fallback note for troubleshooting only.

## [2.36.3] - 2026-05-28

### Changed

- `/th:update` output is now quiet-during-execution with a single polished final report. Added an "Output discipline" contract: the skill runs its steps without narrating between tool calls (the harness's own running-command indicator is the progress signal — a skill cannot render an animated progress bar and must not simulate one), and emits exactly one operator-facing message at the end. The final report is a titled, column-aligned status block (`th update — already current` / `— new version downloaded` / `— installed ahead of catalog`) in neutral declarative voice, no emoji, designed to read like a mature CLI tool.

## [2.36.2] - 2026-05-28

### Fixed

- `/th:update` now performs the **download** step that was missing. The update flow is three steps, not two: (1) `claude plugin marketplace update` refreshes the catalog metadata but does NOT download files; (2) `claude plugin update th@team-harness-marketplace` downloads the new version into the plugin cache; (3) `/reload-plugins` activates it. The skill previously did only (1) and told the operator to reload, so `/reload-plugins` had nothing new in cache and silently kept the old version. The skill now runs (1) and (2) via the `claude` CLI (both Bash-runnable) and the operator does (3). Removed the incorrect "`/plugin update th` is a no-op" claim — it is only a no-op when installed already equals the catalog's latest. Block sync now reads canonical blocks from the highest cached version (the just-downloaded one) so `~/.claude/CLAUDE.md` matches the version being activated.

## [2.36.1] - 2026-05-28

### Added

- `/th:update` now syncs the managed `~/.claude/CLAUDE.md` blocks (`orchestrator-dispatch-rule`, `nested-dispatch-takeover`) on every run, reading the canonical text from the running plugin version's `skills/setup/SKILL.md` and replacing in place between the markers (insert-if-missing, legacy-marker migration, timestamped backup, operator content outside the markers untouched). This closes the drift gap where managed blocks evolved between releases but only `/th:setup` refreshed them: `/th:update` is the repeatable update command and now owns the recurring block sync; `/th:setup` stays a one-time bootstrap and is never part of the update flow.

### Changed

- Realigned `tests/test_agent_structure.py` to the current `skills/<name>/SKILL.md` subdirectory layout (added a `skill_path()` resolver) and corrected ~28 assertions that drifted while the suite was silently crashing on the old flat `skills/status.md` path. Failures were triaged against current content: all were stale expectations (artifact `01-architecture.md`+`02-task-list.md` consolidated into `01-plan.md`; `/x` skill names namespaced to `/th:x`; takeover/install detail relocated to `docs/` and `cmd/install/{tui,workspaces}.go`; Phase 3.75 added to canonical set) or one regex bug (`/th:` namespace capture) — no real regressions. Suite now runs end-to-end: 888/888 structural + 22/22 frontmatter + policy-block all green.

### Removed

- Deleted the orphaned `cmd/legacy-skills/update/SKILL.md` (Go-installer inline-update skill). It was never embedded (`//go:embed` covers only `agents/ skills/ hooks/`) nor referenced anywhere; the Go installer is deprecated and plugin updates use `/th:update` + `/reload-plugins`.

## [2.36.0] - 2026-05-28

### Added

- New `/th:update` standalone skill: refreshes the `team-harness` plugin marketplace catalog (`claude plugin marketplace update`), compares the installed `th` version against the latest available, and reports the delta with the reload instruction. The skill cannot reload the running session — `/reload-plugins` remains operator-driven (a hard Claude Code limitation: `/plugin` and `/reload-plugins` are UI commands with no agent-callable tool). This populates the `/th:update` entry already listed in the skills README roster, replacing the deprecated Go-installer update path.

## [2.35.2] - 2026-05-28

### Removed

- Dropped the unused `team_id` field from `/th:clickup` config (schema + `setup` prompt). No sub-command read it, and in ClickUp's API v2 "team" is the legacy name for "workspace" — so it was redundant with `workspace_id`. Existing configs need no migration.

## [2.35.1] - 2026-05-28

### Fixed

- `/th:clickup` now stores its config in the `clickup` key of the shared plugin config `~/.claude/.team-harness.json` instead of a separate `~/.claude/clickup.json`. All read/write paths merge-preserve the existing keys (`logs-*`, `files` manifest, version metadata). Consolidates all Team Harness settings into one operator-private file.

### Changed

- Documented the single-config-file convention in `CLAUDE.md §5`: skills must not create their own `.json` config files in `~/.claude/`; settings belong under a namespaced key inside `~/.claude/.team-harness.json` (sole exception: Claude Code's native `~/.claude/settings.json`).

## [2.35.0] - 2026-05-28

### Added

- New `/th:clickup` skill with three sub-commands (`setup`, `tasks`, `task <id>`) and orchestrator conversational intent patterns (Step 6c) for ClickUp task ops (comment, status change, close, route-to-pipeline) routed directly to ClickUp MCP tools.
- Final Pipeline Sanity Check in orchestrator — after Phase 4 delivery returns `success`, verifies all expected artifacts (derived from `00-state.md § Agent Results`) are present and non-empty before proceeding to Phase 5. Failure appends a `pipeline.incomplete` event, sets `status: blocked-incomplete`, and escalates to the operator with the list of missing files; no retry (per-phase Artifact Verification Protocol already retried once per agent).
- New managed block `nested-dispatch-takeover` written to `~/.claude/CLAUDE.md` by `/th:setup`. The block tells top-level Claude how to auto-recover from a nested-context `dispatch_handoff` from any repo, not only from `team-harness`. Block content references `docs/subagent-orchestration.md` for the full 8-step protocol and notes the `~/.claude/agents/` red herring (plugin agents live under `~/.claude/plugins/cache/.../th/<ver>/agents/`).

### Changed

- Deprecated the Go installer (`bin/install.{sh,ps1,cmd}` + `cmd/install/`); the Claude Code plugin (`/plugin marketplace add valianx/team-harness` + `/plugin install th` + `/th:setup`) is now the canonical install path. Deprecation banners added to runtime (`cmd/install/main.go`) and script comments; binary remains functional for legacy/offline/CI/low-cost mode use cases. Documentation across `README.md`, `docs/`, `CLAUDE.md §3`, `agents/README.md`, `skills/README.md`, and `site/index.html` updated to reflect the canonical path. New `bin/README.md` documents the legacy bootstrap scripts.

### Fixed

- `/th:clickup setup` no longer asks the operator to type `default_status_filter` from scratch (which yielded a single status). It now informs the operator that `done` and `closed` are excluded by default, lets Enter keep that default, and accepts an optional comma-separated override parsed into an array.
- Namespace syntax in `site/index.html` (6 occurrences) and `assets/scaffolds/team-harness-rereview.yml` (1 occurrence): `@th-orchestrator` / `th-orchestrator` (hyphen) corrected to `@th:orchestrator` / `th:orchestrator` (colon) to match the plugin namespace.

## [2.32.0] - 2026-05-27

### Added

- Artifact Verification Protocol in orchestrator — verifies session-doc exists on disk after every agent dispatch, retry-once on missing, block on double failure
- Phase 3.75 — Build Verification step between acceptance gate and acceptance check, routes build/lint failures to implementer before delivery
- Artifact verification documentation for special flows (research, spike, hotfix, simple) in ref-special-flows.md
- Suite 29 in test_agent_structure.py with 9 assertions for pipeline enforcement improvements
- Pipeline integrity rule in operational-rules.md: artifact verification is mandatory after every agent dispatch

### Changed

- Phase 3.6 (Acceptance Check) is now mandatory — conditional skip table removed; only exception: hotfix + single-file fix
- Phase 4.5 (Internal Review) is now mandatory — conditional skip table removed; only exception: hotfix + single-file fix

## [2.31.0] - 2026-05-25

### Added

- Token usage tracking in execution events (`tokens`, `duration_ms` per phase, `total_tokens` at session end)
- Troubleshooting guide (`docs/troubleshooting.md`) for plugin install and config issues
- `/th:setup` writes orchestrator dispatch rule to `~/.claude/CLAUDE.md` with operator language detection
- `security_sensitive` and `frontend_scope` fields persisted in `00-state.md` (survive context compaction)

### Changed

- Renamed `agents/th-orchestrator.md` to `agents/orchestrator.md` — plugin namespace is now `th:orchestrator` (was `th:th-orchestrator`)
- Skills `status`, `trace`, `recover` now resolve workspace path from `.team-harness.json` logs-mode (obsidian support)
- Dispatch rule uses `th:orchestrator` namespace for plugin compatibility
- Plugin version bumped to force cache refresh after frontmatter fixes

### Fixed

- Skill YAML frontmatter: added `name` and `description` fields for plugin discovery (was showing 0 skills)
- Removed duplicate `name:` lines outside frontmatter caused by sed corruption
- Plugin install README uses `/reload-plugins` instead of `/plugin install` for updates

### Removed

- `/th:update` skill hidden from plugin (moved to `cmd/legacy-skills/`) — updates via `/plugin marketplace update`

## [2.30.0] - 2026-05-25

### Changed

- Renamed `agents/th-orchestrator.md` to `agents/orchestrator.md` — avoids double plugin namespace `th:th-orchestrator`, now invoked as `th:orchestrator`
- Updated all 67 files referencing the old agent name
- Plugin install is now the only documented install method in README
- Added update instructions to README (`/plugin marketplace update`)

### Removed

- `/th:update` skill hidden from plugin (moved to `cmd/legacy-skills/`) — plugin updates via `/plugin marketplace update` instead

## [2.29.0] - 2026-05-25

### Added
- Claude Code plugin format (`.claude-plugin/plugin.json`) with marketplace distribution
- `/th:setup` skill for interactive MCP and workspace configuration
- `.claude-plugin/hooks.json` for plugin-mode hook registration
- `.claude-plugin/marketplace.json` for custom marketplace distribution
- Migration guide (`docs/plugin-migration.md`) for existing installer users

### Changed
- All 30 flat skills restructured from `skills/*.md` to `skills/<name>/SKILL.md` directory format
- All internal skill references updated to `/th:skill-name` namespace
- Go installer updated to copy skill directories instead of flat files
- `/th:update` updated for directory-based skills with legacy orphan cleanup
- Skill counter in `summary.go` now checks `/skills/` path

### Removed
- Flat skill files (`skills/*.md`) — replaced by directory format (`skills/<name>/SKILL.md`)
- `.mcp.json` — MCP configuration handled by `/th:setup` instead of plugin userConfig

## [2.28.0] - 2026-05-25

### Added

- Merge/push guard in th-orchestrator — refuses to merge PRs or push until Phase 3 (Verify) and STAGE-GATE-3 are complete. Operator instructions like "merge them" do not override without explicit "skip verification" acknowledgment.
- Research Flow transition contract (ref-special-flows.md) — defines the mandatory reclassification path when operator chooses "implement" after a research pipeline. Forces re-entry at Phase 0b with full pipeline gates (STAGE-GATE-1, Phase 3, STAGE-GATE-3). Closes the contract gap that allowed research→implement to bypass all verification.

### Changed

- Reverted th-orchestrator to subagent dispatch mode. The inline execution mode (introduced to avoid a cosmetic boot probe message) weakened pipeline gate enforcement — stages were skipped because top-level Claude prioritized user requests over the orchestrator contract. The orchestrator now runs as `Agent(subagent_type='th-orchestrator')` where its contract is the system prompt.
- Simplified th-orchestrator boot sequence from ~140 lines to ~40. Silent on happy path — no boot acknowledgment line, no manifest read announcement. The dispatch probe and workspaces path resolution still run, but produce no visible output.
- Installer (`global_claude_md.go`) now writes a subagent dispatch rule instead of the inline execution rule. Migrates users from old `<!-- th-orchestrator-inline-rule -->` markers automatically.

### Removed

- `hooks/orchestrator-guard.sh` — the hook that blocked `Agent(subagent_type='th-orchestrator')` is no longer needed since the orchestrator now runs as a subagent by design.
- Orchestrator-guard entries from `hooks/config.json` (all 3 OS blocks).

## [2.27.0] - 2026-05-25

### Added

- Phase Transition Protocol in th-orchestrator — consolidates event append + state update + dispatch into an atomic 3-step sequence, preventing missed execution events.
- 9 structural assertions in Suite 20 (test_agent_structure.py) guarding the Phase Transition Protocol against regression.

## [2.26.0] - 2026-05-25

### Changed

- Renamed "session-docs" concept to "workspaces" across the entire codebase — agents, skills, installer, tests, and documentation. The workspace is the shared working directory where agents communicate and the operator reviews outcomes. Functionally identical; directory path changes from `session-docs/` to `workspaces/`.

## [2.25.0] - 2026-05-25

### Fixed

- Intake step ordering: operator language detection (Step 1c) now runs before session-docs creation (Step 1d), ensuring `00-state.md` is written with the correct language from the start.
- Added mandatory Step 1e (execution events file initialization) immediately after `00-state.md` creation, preventing missing observability traces.

### Changed

- Installer now deploys points 6-8 to the `~/.claude/CLAUDE.md` orchestrator block: mandatory session-docs, operator language propagation, and execution events at every phase transition.

## [2.24.0] - 2026-05-25

### Changed

- Execution events trace file uses `.md` format with YAML frontmatter and code-fenced JSONL in obsidian mode (`00-execution-events.md`); local mode unchanged (`.jsonl`). Skills `/trace` and `/status` detect both formats automatically.
- th-orchestrator now detects operator chat language at intake and propagates it to all dispatched agents via `operator_language` field, ensuring session-docs prose follows the operator's language.

## [2.23.0] - 2026-05-24

### Added

- **Hooks count in installer summary** (`cmd/install/summary.go`): `countInstalledAgentsAndSkills` renamed to `countInstalledAssets`, extended with a `hooks` return value and a `/hooks/` path-segment counter. Final message now reads "Installation completed successfully. X agents, Y skills, Z hooks installed."

### Fixed

- **`/th-update` displays wrong reinstall command on Windows** (`skills/th-update.md`): the "no update needed" block previously showed the Unix-only `curl | bash` command on all platforms. Replaced with platform-conditional prose: `irm https://valianx.github.io/team-harness/install.ps1 | iex` on Windows, `curl -fsSL https://valianx.github.io/team-harness/install.sh | bash` on macOS/Linux.
- **Installer final message ambiguous wording** (`cmd/install/summary.go`): "Installation complete." changed to "Installation completed successfully." for unambiguous success confirmation.

### Changed

- **th-orchestrator state template gains `docs_root`/`logs_mode` fields** (`agents/th-orchestrator.md`): both fields persisted in `00-state.md` at boot for recovery and path resolution. Phase Checklist section added as a guardrail against phase skipping. Phase Dispatch Reference table added for inline execution. Step 1c mandates early session-docs creation before any investigation. Substitution rule for session-docs paths documented.

## [2.22.0] - 2026-05-24

### Changed

- **Session-docs consolidated from 12 files to 7** — `01-architecture.md` + `02-task-list.md` merged into single `01-plan.md` (human-first: Review Summary → Architecture → Task List). `00-task-intake.md` eliminated (architect writes spec directly into plan). `01-plan-review.md` merged into `01-plan.md` § Plan Review. `06-acceptance-check.md` merged into `04-validation.md` § Drift Analysis. `05-delivery.md` merged into `00-state.md` § Delivery.
- **Execution log replaced with JSONL event trace** — `00-execution-log.md` (lossy markdown table) replaced by `00-execution-events.jsonl` with per-agent token counts, tool usage, duration, and MCP call tracking. Queryable via `jq` or `/trace`.
- **Agent status blocks now include `tools:` self-reporting** — all 17 agents report per-tool-type usage counts (`read:N write:N edit:N bash:N grep:N glob:N context7:N mcp_memory:N`) in their status blocks. The th-orchestrator combines this with Agent() harness metadata (tokens, duration) for JSONL events.
- **`context7_consult:` standardized** across all 17 agents that return status blocks.

## [2.21.0] - 2026-05-24

### Added

- **Charm huh TUI installer** (`cmd/install/tui.go`, `cmd/install/tui_styles.go`): replaces raw `bufio.Scanner` prompts with a polished `charm.land/huh/v2` multi-group form. Features: password-masked inputs for API keys and bearer tokens, radio-select fields for install mode and work-logs output, Keep/Change confirmation for existing values, JSON snippet paste detection with raw-reader fallback, progress spinner during file copy, and lipgloss brand-palette styling. Non-interactive (CI / env-var) paths are preserved unchanged. First third-party dependencies introduced: `charm.land/huh/v2` and its transitive dependencies (bubbletea v2, lipgloss v2, bubbles v2); binary size increases from ~4.5 MB to ~8-8.5 MB (under 20 MB soft cap).

### Fixed

- **Installer never modifies user logs config** (`cmd/install/session_docs.go`): once `logs-mode`/`logs-path`/`logs-subfolder` are set in the manifest, the installer always preserves them — the interactive Keep/Change menu is removed. To change logs config, edit `~/.claude/.team-harness.json` directly. First-time installs still prompt.

## [2.20.0] - 2026-05-24

### Added

- **Orchestrator nesting guard** (`hooks/orchestrator-guard.sh`, `hooks/config.json`): PreToolUse hook on the `Agent` tool that blocks `subagent_type=th-orchestrator` calls. Prevents the nesting problem where the orchestrator loses the Task tool at depth 1. All three platforms (Windows, macOS, Linux).
- **Global CLAUDE.md orchestrator rule** (`cmd/install/global_claude_md.go`): installer injects an idempotent "th-orchestrator inline execution" section into `~/.claude/CLAUDE.md`, instructing Claude Code to run the orchestrator at top level (depth 0) instead of spawning it as a subagent. Wrapped in HTML comment markers for safe updates across installs.
- **Installer "Global Config" section** (`cmd/install/main.go`): new install phase that writes system-wide rules to `~/.claude/CLAUDE.md` after file installation. Currently handles the orchestrator inline-execution rule.
- **Automatic hooks registration** (`cmd/install/settings_json.go`): installer merges hook entries from the embedded `hooks/config.json` directly into `~/.claude/settings.json`, eliminating the manual copy step. Merge is semantic: installer-owned matchers are overlaid, user-added matchers and non-hook settings are preserved. Summary no longer instructs users to manually copy hook config.

## [2.19.1] - 2026-05-24

### Fixed

- **`/th-update` destroys manifest config** (`skills/th-update.md`): Step 5b now uses read-modify-write to preserve all existing manifest fields (`logs-mode`, `logs-path`, `logs-subfolder`, etc.) instead of overwriting with `{"version":"..."}` only.
- **Installer `loadManifest()` ordering** (`cmd/install/main.go`): moved `loadManifest()` before interactive prompts so `promptLogsMode()` can read existing config from disk without being overwritten afterwards.
- **Boot sequence enforces manifest read** (`agents/th-orchestrator.md`): session-docs path resolution (`logs-mode`/`base_path`) is now part of the mandatory 3-step boot sequence (new Step 3) instead of a skippable Step 0. Boot acknowledgment line now prints detected `logs-mode` and `base_path` for immediate visibility.

## [2.19.0] - 2026-05-24

### Added

- **Dual-mode session-docs** (`agents/th-orchestrator.md`, 11 agent files, `cmd/install/session_docs.go`): pipeline session-docs can now output to a configured Obsidian vault with YAML frontmatter metadata. Configured via `logs-mode` in `.team-harness.json`. Default: local (current behavior). Agents are mode-unaware — the th-orchestrator resolves the path once and passes it. Session-doc folders now include a date prefix (`{YYYY-MM-DD}_{feature-name}/`) in both modes. Installer gains a new `Work-logs output [l/o]` prompt with env var support (`LOGS_MODE`, `LOGS_PATH`).
- **Human-first document format** (11 agent files): all session-doc files now use a two-section layout — `## Review Summary` for human reviewers (decisions, risks, trade-offs with Obsidian callouts) followed by `## Technical Detail` for agent consumption.
- **Obsidian skills** (`skills/obsidian-markdown/`, `skills/obsidian-bases/`, `skills/json-canvas/`, `skills/obsidian-cli/`): four standalone complex skills for working with Obsidian vaults. Based on [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills), adapted for the team-harness skill format. Per-machine vault configuration at `~/.claude/config/obsidian-vaults.json`.

## [2.18.1] - 2026-05-23

### Fixed

- **Duplicate "Install Mode" header** (`cmd/install/prompts.go`): removed the internal header from `promptInstallMode()` — `sectionHeader("Install Mode")` in main.go already provides it.
- **Terminal closes after install** (`bin/install.ps1`): replaced `exit $proc.ExitCode` with `$LASTEXITCODE` assignment so the terminal stays open after `irm | iex` installs.

## [2.18.0] - 2026-05-23

### Added

- **Installer visual improvements** (`cmd/install/banner.go`, `main.go`, `summary.go`): box-drawing section headers with ANSI colors, colored value/label/warning helpers. Key values (URLs, paths, counts) highlighted in green; labels in purple; warnings in orange. Sections visually separated for readability on small terminal fonts.
- **`/th-update --force` flag** (`skills/th-update.md`): bypasses the version check and downloads regardless of installed version.
- **`/th-update` manifest update** (`skills/th-update.md`): Step 5b writes the installed version to the manifest after copy so the next invocation detects "already up-to-date" correctly.

### Changed

- **Manifest renamed** (`cmd/install/manifest.go`): `.claude-dev-team-manifest.json` → `.team-harness.json`. Migration: the installer reads the legacy file if the new one doesn't exist, then deletes the legacy file.

### Fixed

- **Paste crash at Keep/Change prompts** (`cmd/install/util.go`, `context7.go`): pasting a URL or multi-character content at a single-letter prompt (Keep/Change, Install mode) no longer crashes the installer with `os.Exit(1)`. Instead it warns "Pasted content ignored" and re-prompts, consuming one retry attempt from the 3-attempt budget.

## [2.17.1] - 2026-05-23

### Fixed

- **`/th-update` version check** (`skills/th-update.md`): the skill now compares the latest release tag against the installed version from the manifest before downloading. If versions match, prints "up to date" and exits immediately — no download, no extract, no copy. Previously it always downloaded and replaced all files regardless of version.

## [2.17.0] - 2026-05-23

### Added

- **UX Reviewer agent** (`agents/ux-reviewer.md`): Opus/high agent for UI/UX review on frontend tasks. Auto-dispatched when `frontend-scope: true`. Participates in Stage 1 (enrich mode — adds accessibility, responsiveness, interaction states, component reuse AC) and Stage 3 (validate mode — checks WCAG compliance, component duplication, frontend pattern consistency in parallel with tester/qa/security). Only critical findings (WCAG A violations) block delivery; all other findings are recommendations.
- **`frontend-scope` classification** in th-orchestrator Phase 0a Step 7: auto-detected via file paths (`components/`, `pages/`, `*.tsx`, `*.vue`, CSS) and UI/UX keywords (`button`, `form`, `modal`, `responsive`, `accessibility`). Same pattern as `security-sensitive`.

## [2.16.1] - 2026-05-23

### Changed

- **Slim Voice blocks** (`agents/*.md`): replaced the 24-line Voice block in 18 non-orchestrator agents with a 3-line summary. The th-orchestrator keeps the full block as the only agent that communicates with the operator. Saves ~392 lines of duplicated context, reducing token consumption per agent dispatch.

## [2.16.0] - 2026-05-23

### Added

- **Documentation pipeline** (`type: docs`): new pipeline flow routed through the th-orchestrator. Architect researches a topic → documenter writes diagram-first Obsidian documentation → diagram agents create Excalidraw/Canvas visuals → QA validates coverage → DOC-GATE human checkpoint. Supports multi-topic parallel dispatch and `--lang` for non-English output.
- **Documenter agent** (`agents/documenter.md`): Opus/high agent that transforms `00-research.md` into structured Obsidian vault pages with mandatory Mermaid diagrams per page, wikilinks, callouts, and frontmatter. Writes a `02-documentation.md` manifest flagging pages that need Excalidraw or Canvas diagrams.
- **`/docs` skill** (`skills/docs.md`): entry point for the documentation pipeline with `--lang`, `--folder`, and `--vault` flags.
- **`--vault` flag on diagram skills** (`skills/diagram.md`, `skills/d2-diagram.md`, `skills/likec4-diagram.md`): writes diagram output to an Obsidian vault instead of session-docs. Reads `~/.claude/config/obsidian-vaults.json` for vault path. Also supports `--folder` for subfolder targeting.
- **§7 Document Hygiene** in init template: establishes the "lean CLAUDE.md + rich docs/" convention from project creation. Includes 40 KB file size cap (§7.1), max 10 entries per memory section (§7.2), CLAUDE.md vs docs/ content boundary (§7.3), and docs/ structure reference (§7.4). Init upgrade-path detects and inserts §7 on existing projects.
- **Obsidian skills** (`skills/obsidian-markdown/`, `skills/obsidian-bases/`, `skills/json-canvas/`, `skills/obsidian-cli/`): four standalone complex skills for working with Obsidian vaults.

### Changed

- **Delivery agent auto-offload** (`agents/delivery.md`): Step 5 now checks CLAUDE.md file size after every update. If it exceeds 35 KB, the largest memory section is offloaded to `docs/` automatically. Consolidation threshold lowered from 15 to 8 entries, max from 15 to 10.
- **CLAUDE.md reduced from 48 KB to 37 KB**: extracted §7.3-7.6 (language rules, content boundary, contributor checklist) to `docs/voice-guide.md` and §14 takeover protocol to `docs/subagent-orchestration.md`. Core rules remain inline; detailed reference tables are now pointers to docs/.
- **Init upgrade-path** (`agents/init.md`): now detects and inserts both §6 (Mandatory Working Agreements) and §7 (Document Hygiene) on existing projects.

## [2.15.1] - 2026-05-23

### Changed

- **`docs/pipelines.md` gains Quick reference table** — operators now see the full pipeline list, invocation phrasing, and one-line descriptions in a single section at the top of the doc. Detailed per-pipeline sections remain unchanged below the quick reference.

## [2.15.0] - 2026-05-22

### Changed

- **`/review-pr` skill enriched** (`skills/review-pr.md`, `agents/{reviewer,qa,security,reviewer-consolidator}.md`, `docs/pipelines.md`): the PR review pipeline now creates a temporary git worktree at the PR's head SHA so review agents read files matching what they're reviewing (closes the gap where reviewer read files from `main` while reviewing a refactor PR on `feat/x`). Tier-aware multi-agent dispatch: Tier 3+ PRs run reviewer + qa (if AC found) + security in parallel; lower tiers run reviewer only. New explicit decision menu replaces the autonomous approve/request-changes default: operator chooses `approve / request changes / comment only / defer / cancel`. `comment only` posts the review body without approval state (uses GitHub's `COMMENT` event). Worktree cleanup is trap-style — fires even on early exit. Existing prior-review handling, atomic submission, and Spanish output rules preserved.

## [2.14.0] - 2026-05-23

### Changed

- **Installers always overwrite agents/skills/hooks** (`cmd/install/`): removed the conflict-detection logic that previously refused to overwrite files modified manually in `~/.claude/`. The `--force` flag becomes a no-op for file installation (preserved for backward compatibility with scripts and the `/th-update` skill). Rationale: agent/skill/hook bytes are canonical from the repo; direct edits to `~/.claude/agents/*.md` are not a supported customization path. Operators wanting custom behavior should fork the repo. This matches `/th-update`'s "sync to released bytes" semantic and eliminates the recurring `conflicts: N` friction from the `curl | bash` / `irm | iex` bootstrap one-liners. Operator-specific identity (Memory MCP URL/bearer, context7 API key) keeps its existing Keep/Change menu — only embedded-file overwrites are unconditional now.

## [2.13.1] - 2026-05-22

### Fixed

- **Installer paste-detection false positive on Linux/macOS `curl | bash`** (`cmd/install/context7.go` `promptMenu`, `cmd/install/util.go` `promptMenuWith`, `bin/install.sh`): when invoked via `curl ... | bash`, the installer triggered `Error: pasted multi-character or structured content at a single-letter prompt` even though the operator didn't paste anything. Root cause: bash reads `install.sh` line-by-line from the curl pipe; when bash spawns the installer `.exe`, the `.exe` inherits the same stdin pipe, which still contains the subsequent line `exit $?\n` that bash hasn't consumed yet. The `.exe`'s first menu prompt reads that leftover content and treats it as operator paste. Fixed at two layers: (1) `promptMenu` / `promptMenuWith` now use `openInteractiveInput()` (same pattern as other prompts), falling back to `/dev/tty` when stdin isn't a TTY; (2) `install.sh` explicitly redirects the `.exe`'s stdin from `/dev/tty` when available, preventing the leak at the source. Windows `install.ps1` unaffected — PowerShell does not have the line-by-line stdin pipe semantic.

## [2.13.0] - 2026-05-23

### Added

- **Tier 0 — Trivial/Cosmetic** added to the bug-fix pipeline tier system. Skips session-docs creation entirely; only the implementer + tester suite-no-regress run. Auto-classifies when all of: single file, ≤5 lines, comments/whitespace/docs only, no test paths, no system-level files. Auto-promotes to Tier 1+ if any rule breaks. Closes the ceremony-floor observation from the v2.10.0 dogfood: Tier 1 still required session-docs creation for 1-line typo fixes, which felt over-engineered. Tier 0 is the genuinely-lite path.
- `docs/decisions/gh-fallback-pattern.md`: permanent decision log capturing the 20 architect design questions (Q-1 through Q-20) for the gh-fallback graceful degradation pattern, with the operator decisions and rationale. The original architect design lives in gitignored `session-docs/`; this committed reference preserves the design intent for future contributors. Q-18 (cost-warning UI for multi-reviewer) is documented as the only operator override of architect defaults.

### Changed

- **README version badge auto-syncs with latest release** (`README.md`): replaced the hardcoded shields.io static badge (`version-2.12.0-blue.svg`) with a dynamic shields.io badge that reads the GitHub Releases API (`/github/v/release/valianx/team-harness`). The badge now reflects the latest published release without any manual update at release time. Together with the existing `pages.yml` version substitution in `site/index.html`, both surfaces (README and landing page) stay in sync with the released version by construction — no release-time sync logic required.

## [2.12.1] - 2026-05-23

### Changed

- **GitHub Actions JavaScript runtime forced to Node.js 24** (`.github/workflows/release.yml`, `.github/workflows/pages.yml`): added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` as a job-level env var across both workflows. GitHub flips the default from Node 20 to Node 24 on 2026-06-02; this opt-in eliminates the deprecation warning that has appeared in every release run since v2.9.0 and surfaces any Node 24 incompatibilities before the forced cutover. JavaScript Actions (`actions/checkout`, `actions/setup-go`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`, `actions/upload-artifact`) now run on Node 24 immediately. The exact patch version (24.x.x) is provided by the runner image — for ubuntu-latest, this currently maps to Node 24.16.0 series. team-harness binaries are Go and unaffected.

## [2.12.0] - 2026-05-22

### Added

- **`docs/pipelines.md`** (new): reference document covering all 8+ pipelines — feature pipeline (all phases, STAGE-GATE-1/2/3, Constraint Reconciliation, Internal Review), bug-fix pipeline (type: fix, 4-tier classification with keyword signals / path-pattern signals / operator overrides, auto-escalation, tier_promote), hotfix sub-flow, refactor flow, security-sensitive flow, database changes flow, test pipeline, research/spike flow, plan flow, acceptance gate (Phase 3.5) semantics, gh-fallback graceful degradation (Tier A/B/D), and multi-reviewer flow.

### Changed

- **`README.md` simplified to minimal landing page**: install one-liner (sh/ps1/cmd), quickstart `@th-orchestrator` examples, requirements summary, and a links table pointing to `docs/`. Detail-heavy sections (pipeline phases, agent lists, STAGE-GATE explanations, INSTALL_MODE matrix, skill counts) removed from README and now live in `docs/pipelines.md`, `docs/install.md`, `docs/how-it-works.md`, or `agents/README.md`.
- **`docs/how-it-works.md` updated**: agents/skills list expanded to include `reviewer-consolidator`, `/background`, and the `PreToolUse` policy gate description. Cross-reference section added pointing to `docs/pipelines.md` for full pipeline detail.

### Fixed

- **12 README-drift test failures resolved** (`tests/test_agent_structure.py`):
  - *Removed* (brittle assertions): skill count (29) and agent count (17) — exact counts fail on every release; the invariant that every shipped skill/agent exists is covered by Suite 1 and Suite 19.
  - *Moved to `docs/how-it-works.md`*: `/background` mention; PreToolUse policy gate surface.
  - *Moved to `docs/pipelines.md`*: Constraint Reconciliation; Internal Review; STAGE-GATE-1; STAGE-GATE-2; STAGE-GATE-3.
  - *Moved to `docs/install.md`*: no-default-URL positive statement; INSTALL_MODE env var reference; `agents/README.md#low-cost-mode` link.

## [2.11.1] - 2026-05-23

### Changed

- **Orchestrator nested-context limitation documented** (`CLAUDE.md` §14, `agents/th-orchestrator.md`, `docs/install.md`): when `th-orchestrator` is dispatched from a nested subagent context (e.g., from another agent, chained orchestrator dispatch), the `Task` tool is stripped by the Claude Code harness as an anti-recursion safety. The orchestrator cannot dispatch specialist agents and emits a `dispatch_handoff` directive to top-level Claude. The handoff format now leads with a human-readable summary; the JSON block follows as supporting detail. Documentation surfaces the constraint visibly, lists correct invocation patterns, and identifies the anti-pattern that triggers the handoff.

### Fixed

- **README.md missing plan-reviewer mention** (`README.md`): the structural test in `tests/test_agent_structure.py` asserts that the top-level README surfaces every pipeline agent for discoverability. The `plan-reviewer` agent was added in v2.9.0 (bug-fix pipeline Rules 7+8) but never propagated to the README. Added a brief mention in the agents section. Closes the README-drift assertion for plan-reviewer.

## [2.11.0] - 2026-05-22

### Changed

- **Windows installer manifest embedded** (`cmd/install/manifest.xml` + `goversioninfo`): the installer binary now ships with an `asInvoker` execution-level manifest declaring that it does not require elevation. Windows' installer-detection heuristic (which forces UAC on executables whose filename contains `install`, `setup`, `update`, or `patch`) no longer triggers, regardless of filename. The v2.9.4 filename-rename workaround in `install.ps1` is preserved as defense-in-depth — both protections layered are stronger than either alone.

## [2.10.2] - 2026-05-22

### Fixed

- **`release.yml` missing `actions: write` permission** (`.github/workflows/release.yml`): the v2.10.1 "Trigger pages publish" step failed with `HTTP 403: Resource not accessible by integration` because the job's `permissions` block only declared `contents: write`. The `workflow_dispatch` API endpoint requires `actions: write` on `GITHUB_TOKEN` — added to the `permissions` block. Without this scope, the `gh workflow run pages.yml` call is rejected at the API layer regardless of the `workflow_dispatch` event exception to anti-loop chaining.

## [2.10.1] - 2026-05-22

### Fixed

- **`pages.yml` not auto-triggered on release publish** (`.github/workflows/release.yml`): every release from v2.9.0 through v2.10.0 required a manual `gh workflow run pages.yml` to publish the updated landing page. Root cause: GitHub blocks workflow-on-workflow events initiated with `GITHUB_TOKEN` (anti-loop security feature), so the `release: published` event from `gh release create` did not chain to `pages.yml`. Added an explicit `gh workflow run pages.yml --ref main` step at the end of `release.yml` — `workflow_dispatch` is one of the documented exceptions that chains even via `GITHUB_TOKEN`. No new secrets required.

## [2.10.0] - 2026-05-22

### Added

- `agents/_shared/gh-fallback.md`: single source-of-truth fallback patterns for graceful degradation when the `gh` CLI is unavailable. Covers Tier A (read via curl), Tier B (write via curl or operator paste), Tier D (project board skip), detection probe, origin parser, `blocked-manual-push` status, and operator-facing copy templates. Part of the gh-fallback graceful degradation track (v2.10.0).
- `assets.go` now uses `//go:embed all:agents skills hooks` so the new `agents/_shared/` subdirectory is included in the installer binary (Go embed excludes `_`-prefixed directories by default).
- `cmd/install/main.go` `installAgents` now recurses into agent subdirectories, installing `agents/_shared/` to `~/.claude/agents/_shared/` alongside the flat agent files.
- `tests/test_agent_structure.py` Suite 27: structural checks for the shared gh-fallback snippet (file existence, required sections, detection probe, tier documentation, `blocked-manual-push`, assets.go embed directive).

### Changed

- Installer `requireCLI("gh", …)` downgraded to `warnCLI("gh", …)`: missing `gh` now prints a one-line recommendation and continues rather than hard-exiting. Skills `/issue`, `/deliver`, and `/review-pr` fall back to manual paths when `gh` is unavailable. New `warnCLI` function added to `cmd/install/util.go`.
- `agents/delivery.md` Steps 2, 3.2, 11.0–11.3 updated with Tier A/B/D fallback cross-references to `agents/_shared/gh-fallback.md`. Step 11 no longer skips PR creation when `has_gh=false`; uses curl fallback or `blocked-manual-push` escape hatch instead. Return Protocol adds `blocked-manual-push` as a valid status value with structured operator-facing fields.
- `agents/th-orchestrator.md` Phase 0a Step 5, Phase 0b Step 4, Phase 5 Steps 1-2 updated with Tier B/D fallback cross-references. Delivery gate gains `blocked-manual-push` handling with operator pause/resume protocol.
- `skills/{issue,plan,design,define-ac,audit}.md` Mode 1 `gh issue view` updated with Tier A fallback cross-references. Error handling describes graceful degradation rather than hard failure.
- `skills/review-pr.md` Phase 1 Steps 2-3, Phase 3 Steps 12/12a-12c/13 updated with Tier A/B fallback cross-references. Atomic PR review submission preserved across `gh` and curl paths.
- `agents/ref-special-flows.md` Spike Flow Step 8 and Plan Flow Step 6 updated with Tier B fallback cross-references. Existing local-file fallback retained as final escape hatch.
- `CLAUDE.md` §1: `gh` moved from required to recommended with fallback contract described. §3: embed directive updated to `all:agents`. §14: `blocked-manual-push` protocol documented.
- `docs/install.md` Requirements: `gh` moved to recommended section with curl/paste fallback noted.
- `site/index.html` Requirements: `gh` labelled recommended with fallback note.
- `agents/README.md` roster: `agents/_shared/` cross-cutting snippet documented.
- `docs/contributing.md`: smoke-test paragraph for gh-fallback paths added.
- `assets/scaffolds/team-harness-rereview.yml`: GitHub Actions re-review reminder workflow template. Triggers on `pull_request.synchronize`, posts a comment when reviews go stale. Scaffolded by `/init --scaffold-rereview-workflow`.
- `agents/init.md` Phase 4.5 `--scaffold-rereview-workflow` scaffold behaviour. `skills/init.md` updated to parse and propagate the flag.
- `docs/knowledge.md` pattern entries for gh-fallback and re-review scaffold. `docs/install.md` Optional scaffolds section.
- `assets/scaffolds/review-policy.md`: starter policy template for `/init --scaffold-review-policy`. Hybrid YAML frontmatter + markdown body. `schema_version: 1`, `focus_overrides` map, example rules.
- `agents/reviewer.md`: Focus modes section (`general`/`security`/`architecture`/`style`); Policy-aware review section (`Has Policy` field, `## Violaciones de política` body section, de-dup rule, policy criticals non-overridable).
- `skills/review-pr.md` Step 1.5 loads `.team-harness/review-policy.md`. Phase 2 payload gains `Has Policy:` and `Review Policy:` fields. `agents/ref-direct-modes.md` Review Mode Step 2 passes the policy fields to the reviewer.
- `agents/init.md` Phase 4.5 `--scaffold-review-policy` behaviour. `skills/init.md` parses and propagates both scaffold flags.
- `agents/reviewer-consolidator.md` (new): merges 2-3 focused review drafts into one unified PR review. De-dup, contradiction surfacing, strict verdict, Spanish output per §7.3.
- `agents/README.md` roster and low-cost matrix updated to 18 agents. `cmd/install/modes.go` and tests updated.
- `skills/review-pr.md` gains `--multi` / `--reviewers <focuses>` flags; auto-suggest (>1500 lines OR >8 files → one info line, no cost warning); parallel focused reviewer dispatch; consolidation step; re-review continuity; Step 15.1 full focus-draft cleanup. No cost-warning UI per operator override Q-18.
- `agents/ref-direct-modes.md` Review Mode gains `Mode: review-consolidate` routing and Step 2d (Consolidation).

### Fixed

- **Installer terminal closes on Mac/Linux after install** (`bin/install.sh`): replaced `exec` with subprocess invocation to preserve exit code; no "Press Enter to close" prompt. The installer exits cleanly with the installer's exit code. Operators who want to review the install summary can scroll up in their terminal; the terminal itself stays open (or closes) per the terminal's own behavior, not the script's.
- **Installer silently preserves existing config on `curl | bash`** (`cmd/install/prompts.go`, `cmd/install/context7.go`): the Keep/Change menu for existing Memory MCP URL and context7 API key was skipped when stdin was piped (curl | bash case), even though `/dev/tty` was available for interactive input. Added `hasInteractiveInput()` helper that considers either stdin TTY or `/dev/tty` as interactive, and switched the relevant gates to use it. Operators running `curl | bash` with existing valid config now get the Keep/Change menu and can edit their settings. True non-interactive contexts (CI) still preserve silently.
- **Change always goes to interactive prompt** (`cmd/install/prompts.go`, `cmd/install/context7.go`): when the operator explicitly picks Change at the Keep/Change menu for Memory MCP URL or context7 API key, the installer now opens an interactive TTY input directly instead of falling through to the env var check. The env var (`MEMORY_MCP_URL`, `CONTEXT7_API_KEY`) is only used on initial installs or non-interactive re-installs — never as a silent override when the operator asked to change the value interactively.

## [2.9.4] - 2026-05-22

### Fixed

- **Installer UAC elevation triggered by filename heuristic** (`bin/install.ps1`): v2.9.3 still hit `The requested operation requires elevation` because Windows applies an "installer detection" heuristic to executables whose filename contains `install`, `setup`, `update`, or `patch` — and silently forces UAC even when launched via `CreateProcess` with `UseShellExecute=$false`. The downloaded `.exe` is now saved as `th-bootstrap.exe` (neutral name) to bypass the heuristic, plus `Unblock-File` strips the Mark-of-the-Web Zone Identifier as a belt-and-suspenders measure. Proper long-term fix is to embed an `asInvoker` execution-level manifest in the Go binary (via `goversioninfo` / `.syso`) — deferred to a future PR.

## [2.9.3] - 2026-05-22

### Fixed

- **Installer UAC error on Windows PowerShell** (`bin/install.ps1`): the v2.9.2 fix used `Start-Process -NoNewWindow -Wait -PassThru` which triggers UAC elevation prompts when the working directory is protected (e.g., `C:\Windows\System32`) or when the downloaded `.exe` carries Mark-of-the-Web. Operators saw `Start-Process: This command cannot be run due to the error: The requested operation requires elevation.` even on standard user accounts. Replaced with direct `[System.Diagnostics.ProcessStartInfo]` invocation with `UseShellExecute = $false`, which bypasses ShellExecuteEx (no UAC mediation) and inherits the parent console naturally (no stream redirection). Cross-compatible with PowerShell 5.1 and 7.x.

## [2.9.2] - 2026-05-22

### Fixed

- **Installer UX on Windows PowerShell** (`bin/install.ps1`): bootstrap now uses `Start-Process -NoNewWindow -Wait -PassThru` instead of `& $InstallerPath @args`, forcing the installer `.exe` to inherit the parent PowerShell console. Previously, running `irm install.ps1 | iex` spawned a separate cmd window because PowerShell's pipeline context with `iex` triggered Windows console reallocation; that window closed on exit, hiding errors and prompts. The new invocation keeps all output in the operator's session.
- **Installer prompt validation** (`cmd/install/context7.go` `promptMenu`, `cmd/install/util.go` `promptMenuWith`): single-letter menu prompts (Keep/Change, install mode `s/l`) no longer silently coerce invalid input to the default value. Single invalid character → re-prompt with an explicit error listing valid options (up to 3 attempts). Multi-character or structured paste (JSON, URL) at a y/n prompt → exit immediately with a clear "you pasted at the wrong prompt" error, preventing scanner-buffer leak into subsequent prompts. Closes the silent-failure path where the operator pasted the MCP URL snippet at the Keep/Change prompt and saw the URL not update.

## [2.9.1] - 2026-05-22

### Fixed

- Installer (`curl | bash` on Unix/macOS) now prompts interactively even when stdin is the curl pipe, by opening `/dev/tty` directly. Previous behavior required setting `MEMORY_MCP_URL` (and other env vars) as a precondition, blocking first-install and legacy-migration UX. The `/dev/tty` fallback follows the established pattern used by rustup, oh-my-zsh, and nvm. CI scripts that intentionally run non-interactive (no controlling terminal) continue to require env vars; behavior unchanged for that case. Windows behavior unchanged (no `/dev/tty` to fall back to).

## [2.9.0] - 2026-05-22

### Added

- **Bug-fix Pipeline**: dedicated flow for `type: fix` and `type: hotfix` that produces the full session-docs artifact set (same backbone as feature flow), with new artifacts `01-root-cause.md` (architect's focused root-cause analysis, 1pg max) and `02-regression-test.md` (tester's failing test authored BEFORE implementer runs). plan-reviewer gains Rules 7 + 8 for regression-test gating. Implementer enforces scope discipline (zero tangential refactors). Type-classified by intent triggers from v2.8.0; operator-facing surface is unchanged (no new slash command — `/hotfix` deferred to v2). Pipelines are **tier-classified (1-4)** based on bug content keywords, impacted file paths, and operator override. Tier 1 (docs/trivial) skips the architect and conditionally skips the pre-fix regression test when no behavior change (touched paths limited to `*.md` / `LICENSE` / `CHANGELOG*` / comments / non-functional strings, no `*.test.*` paths, no `[regression-test: required]` declaration); Tier 2 (light) uses inline root-cause + tester + qa; Tier 3 (standard, default) is the full pipeline + security; Tier 4 (critical/security) adds mandatory memory prior-art query (`mcp__memory__search_nodes`) and extended security analysis (adjacent-code surface beyond the diff). Auto-escalation favors high-tier signals: any fix touching a security-sensitive path (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`) lands at Tier 3+ regardless of operator hint. Architect can re-tier mid-flow via `tier_promote` + `tier_promote_rationale` with operator confirmation (same protocol as `type_reclassify`). Operator can override via `[TIER: N]`, `[regression-test: required]`, or `[security: required]` markers. The "security runs always for bugs" rule from the initial PR #50 design is preserved for Tier 3+; Tier 1 / Tier 2 fixes skip security because the auto-escalation rule guarantees sensitive paths always land at Tier 3+ at classification time.

### Fixed

- GitHub Pages landing version had drifted from `v2.3.0` across releases v2.4.0 through v2.8.0 because the version was hardcoded in `site/index.html` and not bumped at release time. The `pages.yml` workflow now extracts the version from `cmd/install/main.go` and substitutes a `{{VERSION}}` placeholder into the published landing at every publish event. The page is now self-correcting on every release; no manual bump required.

## [2.8.0] - 2026-05-22

### Changed

- th-orchestrator intent table extended with Spanish bug-fix triggers (`solucionar`, `arreglar`, `corregir`, `fixear`, `debuguear`, `regresión`, `error`) and common Spanish imperative phrasings (`corrija un bug`, `haga un fix`, `haga un hotfix`, `corregir error`). Closes a routing gap where Spanish bug-fix requests fell through to `unclear` instead of the full pipeline. PR-1 of the bug-fix pipeline design (`session-docs/bug-fix-flow/01-architecture.md`).

## [2.7.0] - 2026-05-22

### Changed

- Voice contract baked into every agent and standalone skill prompt so the formal-neutral voice rule (CLAUDE.md §7.1) is enforced regardless of which project the operator invokes the agent from. Closes a gap where agents installed via `/th-update` would drift to casual voice when used outside the team-harness repo because the project-local CLAUDE.md was not in scope. CLAUDE.md §7.1 also gains an explicit universal-scope clause covering chat replies, memory writes, and self-corrections.

## [2.6.0] - 2026-05-22

### Changed

- **Breaking change:** orchestrator agent renamed to `th-orchestrator` to cluster operator-facing surfaces under the `@th` autocomplete prefix. Existing installs will have a stale `~/.claude/agents/orchestrator.md` after `/th-update`; the skill removes it automatically (one-shot legacy cleanup). Operators must use `@th-orchestrator <task>` instead of `@orchestrator <task>` from this release forward.

## [2.5.1] - 2026-05-22

### Changed

- `/th-update` no longer requires the `gh` CLI. Tag resolution and tarball download both use `curl` directly, matching the bootstrap install path's "just needs curl" surface. `gh` remains a repo-wide requirement for `/issue`, `/deliver`, `/review-pr`.

## [2.5.0] - 2026-05-22

### Changed

- `/th-update` rewritten to run inline in the agent (no Go installer launch). Resolves output-capture failure on Windows where the spawned installer console was unreadable; removes installer overhead (TTY prompts, MCP re-registration, "Press Enter to exit") that's irrelevant on update. The skill now downloads the release source tarball via `gh release download --archive=tar.gz`, extracts it, and copies files into `~/.claude/` using the documented mapping. Bootstrap install path (`install.sh` / `install.ps1` / `install.cmd` one-liners) is unchanged.

## [2.4.1] - 2026-05-22

### Changed

- `/th-update` now always overwrites every team-harness file under `~/.claude/` — the `--force` flag is removed from the operator surface and always passed to the installer internally. The skill's purpose is "sync to released bytes," so conflict gating was friction rather than safety. Operators who customize agents should fork the repo or contribute upstream — local hand-edits to `~/.claude/agents/*.md` are out of scope.

## [2.4.0] - 2026-05-22

<!-- The following entries accumulated in [Unreleased] across PR #26 / PR #27 / PR #28
and earlier work, and were not promoted to their version sections when their PRs
shipped. A follow-up CHANGELOG hygiene PR will split them into the correct
[2.2.0] / [2.1.0] / earlier sections. They are intentionally NOT included under
[2.3.0] (the curl-installer release) below — that section contains only the
curl-installer feature work, matching Keep-a-Changelog's "one subheading per
section per version" expectation. -->

### Added

- New `/th-update` skill: re-runs the installer to pull the latest agents/skills/hooks; reminds operator to restart Claude Code.
- **GitHub Pages landing page overhaul**: new `site/index.html` with dark-indigo design replacing the minimal heredoc-built page in `.github/workflows/pages.yml`. Post-deploy smoke probe extended to also verify the `/` root.

### Changed

- Aligned operator-facing surfaces (agents, skills, installer, docs) to the voice and language guide (formal-neutral voice, dev-natural vocabulary, English-only with documented security/reviewer exception). Codified the guide as `## 7. Voice and Language Guide` in CLAUDE.md. Added test Suite 25 to enforce the rules at CI time.

### Added

- **Orchestrator stage-end notifications: 4 native OS toasts per pipeline** (after Stage 1 Analysis, Stage 2 Implementation batch, Stage 3 Verify, Stage 4 Delivery). Fires always regardless of autonomy mode and pipeline outcome. New script `hooks/notify-stage.sh` detects OS and routes to the existing per-OS `notify-{os}.sh`. Idempotent across context compaction and `/recover` via `stage.notify` event dedup in `00-execution-events.jsonl` (structured JSON parse, not regex — eliminates false-positive risk). Independent of the ultra-quiet hook preset (PR #26) — the preset controls Claude Code hook events; these toasts are fired directly by the orchestrator's `Bash` tool. New `## Stage-end notification protocol` section in `agents/orchestrator.md` documents the toast mapping table, JSON payload schema, JSONL event schema, idempotency mechanism, input sanitisation contract, and failure-safety guarantee.

### Changed

- **BREAKING: removed the installer's hardcoded default Memory MCP URL** (`cmd/install/prompts.go`). Non-interactive installs without `MEMORY_MCP_URL` now exit 1 with an explicit error; interactive prompts no longer accept empty input. Motivation: a silent default produced misleading "connection refused" diagnostics for operators whose actual MCP lived on a different host, and propagated the misleading URL into agent skip-logs that referenced `CLAUDE.md §1`'s documented default. This is an open-source distribution — the MCP can live on any host (Railway/Render/Fly/Docker/local), so no specific URL is canonical to this repo and the installer never fabricates one. Existing valid `mcpServers.memory` entries in `~/.claude.json` are still preserved unchanged — only fresh installs and `--force` reinstalls are affected. CLAUDE.md §1 and README.md updated to drop the default and document the new contract; the 2 Go tests that exercised the removed fallback path were dropped with comments referencing the new contract.
- **Robustness pass on `delivery` Step 11.5 KG passive capture** (`agents/delivery.md`): added a mandatory `mcp__memory__doctor` pre-flight check before any `create_nodes` / `add_observations` / `search_nodes` call, so a stale or unreachable MCP wiring fails fast with the doctor output instead of generating a misleading "MCP unreachable at <guessed URL>" log line. Added a `Pending payload fallback` contract: on `mcp-unreachable` / `mcp-unhealthy` / `mcp-not-wired` skip reasons, write the would-be payload (with `skip_reason`, `intended_action`, `gate1_result`, `gate2_result`) to `session-docs/{feature-name}/kg-passive-capture.pending.json` so the operator can replay it from a fresh Claude Code session where the MCP client is wired correctly. Skip logs are now forbidden from inventing URLs (the agent must log only what `doctor` reports, never CLAUDE.md's documented default). Frontmatter extended with `mcp__memory__doctor`. Suite 21 gains 5 regression guards (frontmatter, pre-flight section, URL-embellishment ban, pending payload section, pending payload path). Suite count: 522 → 529 (also adds 7 no-default-mcp-url regression guards verifying CLAUDE.md, README.md, and prompts.go no longer carry the removed default).

### Security

- **CWE-78 (shell injection) closed in notification call-sites** (`agents/orchestrator.md`): all 4 stage toast call-sites switched from `echo '{"stage":N,...,"feature":"{feature}",...}'` (single-quoted bash string — `'` in a feature name breaks out of the string) to `python3 -c "import json,sys; print(json.dumps(...))"` with values passed as `sys.argv` positional arguments. `json.dumps` handles all metacharacters safely; user-controlled strings never touch the shell string layer.
- **CWE-20 (improper input validation) closed for idempotency check** (`agents/orchestrator.md`): all 4 idempotency lookups switched from `grep -c '"event":"stage.notify".*"stage":N'` (unanchored regex — could false-positive on substrings in `summary` text) to a `python3 -c "...json.loads(l).get('event')=='stage.notify' and json.loads(l).get('stage')==N..."` structural JSON parse. Keyed on typed field values, not raw text.
- **Input sanitisation contract added** (`agents/orchestrator.md` `### Input sanitisation contract`): orchestrator MUST pre-sanitise `{feature}` (kebab-case regex), `{summary}` (≤120 chars, strip `\n\r\t'"`), `{cwd}` (absolute path, no shell metacharacters), `{status}` (closed-set enum) before constructing the payload — defence-in-depth on top of the `json.dumps` fix.
- **PowerShell single-quote escape corrected** (`hooks/notify-windows.sh`): `sed "s/'/\\\\'/g"` (which produced invalid PowerShell `\'`) replaced with `sed "s/'/''/g"` (doubled single quote — the canonical PowerShell escape). Prevents broken `LoadXml` calls and closes the injection vector on feature names containing apostrophes.
- **macOS osascript injection closed** (`hooks/notify-mac.sh`): `osascript -e "display notification \"${AS_BODY}\" with title \"${AS_TITLE}\""` (bash-interpolated — `$(...)` in body expanded by shell) replaced with `printf 'display notification "%s" with title "%s"\n' "$AS_BODY" "$AS_TITLE" | osascript`. Format string in single-quotes (no bash expansion); values travel as `printf` positional arguments into a stdin pipe, eliminating the shell-substitution surface entirely.

### Added

- **KG passive-capture quality gates (delivery Step 11.5).** Two mandatory pre-flight gates before `create_nodes` to keep noise out of the Knowledge Graph:
  - **Gate 1 — Specificity (`suggest_node_type`):** concat proposed observations, call the classifier; if top-1 confidence < 0.5 OR top-1 type ≠ `process-insight` by ≥ 0.2 margin, skip the write. Generic insights and mis-typed insights never reach the KG.
  - **Gate 2 — Dedup (`search_nodes` pre-flight):** search by the synthesized summary; if a top-3 result clearly covers the same insight, redirect to `add_observations` on it instead of creating a duplicate. Topically-related-but-distinct matches still write but add an explicit relation note in the new node's first observation.
  - Both gates are best-effort (never block the pipeline on MCP errors). Status block now reports `kg_passive_capture: written | written-with-relation-note: <name> | merged-into: <name> | skipped: <reason> | failed: <error>`. The orchestrator propagates this into the `kg_passive_capture` sub-field of the `tools` object on `phase.end` in `00-execution-events.jsonl`.
  - `agents/delivery.md` frontmatter extended with `mcp__memory__search_nodes`, `mcp__memory__create_nodes`, `mcp__memory__add_observations`, `mcp__memory__suggest_node_type` (the spec previously required `create_nodes` without declaring it).
- **Soft-delete-by-default for `/memory prune` and `/memory consolidate` via `mark_superseded`.** The destructive `delete_entities` action is moved to a new explicit sub-command `/memory hard-delete <entity-name>` requiring double confirmation (user types the entity name verbatim, then confirms with `DELETE <entity-name>`). Rationale: soft-delete preserves history via the supersedes relation and is reversible; hard-delete is restricted to content-policy violations (PII / secrets) that must not persist even in archived form. `mark_superseded` is used in both prune (`old=new=<stale>` self-supersedes pattern, with `archive_old_observations=true`) and consolidate (`old → new` with the consolidated entity as `new`).
- **KG session lifecycle in the orchestrator pipeline.** `agents/orchestrator.md` Phase 0a now opens a session via `mcp__memory__session_start` before `search_nodes` (writes `session-docs/{feature}/session.json` with `session_id`, `project`, `started_at`). Phase 6 closes the session via `mcp__memory__session_end` after all KG writes and the process reflection block. Failures in session_start/session_end never block the pipeline (logged and skipped). This activates the previously-dormant attribution layer in `context-harness-mcp` — every entity created in a pipeline is now attributable to a single unit of work, which is foundational for the multi-tenant team-onboarding ahead.
- `docs/kg-content-policy.md`: two new sections added for multi-tenant readiness:
  - **🕓 Volatility avoidance** — forbids unanchored temporal phrasing (`currently`, `recently`, `as of writing`, `latest version`, `temporarily`, `for now`, `until further notice`, etc.) because observations rot when "current state" lacks a date anchor. Includes a fix table and a real example from the existing `providers-bridge` node.
  - **👥 Multi-tenant additions** — forbids team-member handles as primary entities, preferences without technical rationale, vendor/tenant-specific configs. Requires author attribution on `[decision]` nodes (now possible via `session_start`/`session_end`) and explicit project tag on every node. Recommends split deployments as the cheapest cross-context boundary.
- `tests/test_agent_structure.py` Suite 21 (KG hygiene): 30+ new assertions covering delivery's pre-flight gates, `/memory` skill soft-delete-by-default, the new `hard-delete` sub-command, content policy sections, orchestrator session lifecycle. Total assertions: 495+ (was 465).

### Changed

- **Hooks default preset → `ultra-quiet`.** `hooks/config.json` for all three OS (windows/macos/linux) now wires only `PreToolUse` (policy gate) + `Notification` matcher `idle_prompt`. The previous `Notification` matcher `permission_prompt` and the blanket `PostToolUseFailure *` triggers were removed because they fire while work continues and accumulate in the Windows Action Center / equivalent surfaces without requiring user action. The intent of notifications is now "fire only when the user must take an action". `hooks/README.md` expanded with three named presets (`ultra-quiet`, `default-quiet`, `noisy`) with copy-pasteable JSON snippets, an Action Center explanation for Windows users, and a section on interaction with `agentPushNotifEnabled`. Existing users keep their current `~/.claude/settings.json` until they re-merge from `hooks/config.json` — no breaking change.
- `tests/test_agent_structure.py` Suite 5 regression guard: `delivery` removed from the "excludes mcp__memory__* tools" list. Delivery's Step 11.5 now legitimately requires `search_nodes` (Gate 2 dedup pre-flight) and `suggest_node_type` (Gate 1 specificity) in addition to its previous write tools. The exclusion guard still applies to `implementer`, `plan-reviewer`, and `reviewer`.

### Added

- **Pipeline observability stack (canonical).** Two artifacts per pipeline run, both written exclusively by the orchestrator:
  - `session-docs/{feature}/00-execution-events.jsonl` — append-only event trace, machine-readable, queryable with `jq`. Schema extended with a `dispatch.blocked` event (Task-tool-stripped scenario per CLAUDE.md §13) and a `tools` field on `phase.end` events that propagates context7 / memory / KG counts from the returning agent's status block. Writing the trace is now codified as **mandatory, not best-effort** — skipping appends to save tokens deletes the only signal we have on pipeline health.
  - `session-docs/{feature}/00-pipeline-summary.md` — human-readable rollup with rigid schema (TL;DR / Phase Timeline / Dispatch Issues / Tool Effectiveness / Iterations / Files Changed). Rewritten in full at every phase transition by the orchestrator (cheap, ~30 lines, avoids partial-update inconsistency). All numbers derive from the JSONL — never invented independently. New `## Pipeline Summary Protocol` section in `agents/orchestrator.md` specifies the rewrite contract.
- `skills/trace.md`: new `/trace <feature>` skill — canonical 30-second answer to "did this pipeline work and were the tools effective?" Four modes: default (prints the summary verbatim), `--jsonl` (last 30 raw events via `tail`), `--tools` (per-agent + total tool effectiveness via `jq` aggregation, with grep fallback when `jq` absent), `--fails` (filter to `dispatch.blocked` + iterations + `gate.fail` + non-success `phase.end` + `policy.deny`). Strict read-only contract — same rule as `/status`.
- `skills/status.md` narrative renderer: new "## Pipeline Summary" panel at the top of `<feature-name>` mode, reading `00-pipeline-summary.md`. Skipped silently if the summary is absent (legacy pipelines). Renderer now also points to `/trace` for deeper observability views.
- `agents/architect.md`, `agents/qa.md`, `agents/tester.md`, `agents/security.md`: status block extended with `memory_consult: search_nodes:N open_nodes:N` and `kg_save_candidates: [entity-name, ...]` — mandatory fields, even when counts are zero / list is empty. The orchestrator propagates them into the `tools` object of the JSONL `phase.end` event so the per-pipeline summary can aggregate KG usage.
- `agents/orchestrator.md`: tools-field mapping table documenting how agent status-block lines (`context7_consult`, `memory_consult`, `kg_save_candidates`, `kg_passive_capture`) translate into the JSONL `tools` sub-object schema.
- `CLAUDE.md §5`: new Architectural Conventions bullet "Pipeline observability is mandatory" — codifies the two-artifact stack, the orchestrator-as-sole-writer rule, and the deprecation of `pipeline-metrics.json` + `done.yml`. Mirrors the KG passive-capture + context7 freshness bullets.
- `tests/test_agent_structure.py`: new Suite 20 (Pipeline observability) — 28 assertions validating the new orchestrator sections, the deprecation banners, the trace skill modes, status.md integration, the per-agent status-block fields, and the CLAUDE.md working agreement. Tests now total 465 (was 433).

### Changed

- `agents/delivery.md` Critical Rules: replaced the hard dependency on `done.yml` with explicit re-derivation of completion criteria from `00-task-intake.md` + `04-validation.md` + `03-testing.md` + (optional) `04-security.md` at the top of Step 0. The acceptance gate logic is unchanged; only the `done.yml` artifact dependency is removed.

### Deprecated

- `pipeline-metrics.json` artifact in `agents/orchestrator.md` § "Pipeline Metrics" — kept as historical reference behind a banner; empirically never written across all real pipelines. Replaced by `00-pipeline-summary.md` (aggregate view) + `00-execution-events.jsonl` (event-by-event audit). New pipelines MUST NOT write this file.
- `done.yml` artifact in `agents/orchestrator.md` § "Done.yml" — kept as historical reference behind a banner; never written in practice. "Did this pipeline ship clean?" is now answered by the trailing `pipeline.end.status` field plus the `gate.pass`/`gate.fail` history in the JSONL. New pipelines MUST NOT write this file.

### Added

- `docs/context7-usage.md`: new playbook (~150 lines) documenting how agents must use the context7 MCP — what it is for and against, mandatory triggers per agent, two-step query strategy (`resolve-library-id` → `get-library-docs` with granular topic), hit/miss/n-a verdict scoring with fallback contract, status-block telemetry field (`context7_consult: hit:N miss:N skipped:M`), failure handling, and the `## Documentation Consulted` session-doc section. Reframes context7 from "optional research" to "correctness check" against training-snapshot drift.
- `agents/architect.md`, `agents/implementer.md`, `agents/tester.md`, `agents/security.md`, `agents/translator.md`: context7 tools declared in frontmatter (`mcp__context7__resolve-library-id`, `mcp__context7__get-library-docs`) and mandatory invocation triggers documented in the relevant phase (architect Phase 0 for every cited Decision, implementer Step 2 for every imported third-party library, tester Phase 0 step 4 for the runner + coverage tool, security Phase 0 for OWASP/CWE versions, translator Critical Rules + Phase 2.2 for the i18n library). Each status block now mandates a `context7_consult: hit:N miss:N skipped:M` line — mandatory even when all counts are zero, its presence is the telemetry signal that the agent considered documentation freshness.
- `CLAUDE.md §5`: new Architectural Conventions bullet codifying documentation freshness via context7 as a working agreement (mirrors the KG passive-capture bullet from v2.1.0).

### Changed

- `agents/architect.md`, `agents/tester.md`: rewrote the `## Documentation Consulted` template in session-doc outputs to require `{Library}@{version}: {confirmation summary}` plus an explicit fallback bullet (`context7 unavailable — used training knowledge as of model cutoff`) — replaces the previous "context7 not available — used codebase analysis only" single line. Makes anchoring of decisions to current docs visible to the reviewer.
- `agents/init.md` §2.4: clarified that init's context7 use is a **light reference**, not a mandatory trigger — bootstrap is exploratory and never halts on context7 absence. Mandatory triggers apply only to downstream agents (architect / implementer / tester / security / translator).

### Removed

- `agents/qa.md` Phase 0 step 3 ("Use context7 MCP if available to research framework-specific validation and testing patterns") — overlap with `tester` and not load-bearing for qa's contract (validate code vs AC, define AC, ratify-plan, reconcile). qa keeps `mcp__memory__*` for KG-anchored AC research.
- `agents/delivery.md` Step 1 ("Use context7 MCP if available to research documentation best practices") — CHANGELOG / semver / commit conventions don't change at a cadence that warrants per-task verification.

## [2.3.0] - 2026-05-22

### Added

- **Curl one-liner install (bash / PowerShell / cmd.exe)** matching the Claude Code quickstart pattern. Bootstrap scripts published to `https://valianx.github.io/team-harness/install.{sh,ps1,cmd}` via a new `.github/workflows/pages.yml` workflow triggered on release. New `bin/install.cmd` for legacy Windows cmd.exe hosts.

### Changed

- **Installer binary is now self-contained via `go:embed`** — agents, skills, and hooks are embedded in the binary at compile time (`//go:embed agents skills hooks` in `assets.go` at the repo root). The binary reads from the embedded FS at runtime and does not require a clone of the repo. Assets are pinned to the release tag for deterministic versioning.
- **Bootstrap scripts simplified to deterministic-URL pattern** — `bin/install.sh` and `bin/install.ps1` now use `https://github.com/valianx/team-harness/releases/latest/download/install-{os}-{arch}` directly instead of calling the GitHub Releases API (`api.github.com`) and parsing JSON. Removes the unauthenticated rate-limit exposure (60/hour) and the brittle `grep '"tag_name"' | cut -d'"' -f4` parse.
- **Clone-and-run path updated** — `bin/install.sh` and `bin/install.ps1` now download the released binary (same as the curl one-liner); contributors testing local edits use `go run ./cmd/install` (the `//go:embed` picks up working-tree bytes at compile time). `README.md §Install` foregrounds the three one-liners as the primary path; the clone path moves to the "From source / contributors" subsection.

## [2.2.0] - 2026-05-22

### Added

- **Low-cost install mode** (`INSTALL_MODE=low-cost`): opt-in installer mode that rewrites `model:` and `effort:` frontmatter in-flight during agent copy. All 17 agents run on `sonnet`; effort is `medium` (11 agents) or `high` (6 gate-makers). Designed for developers on lower-tier Anthropic plans (Free, Pro, tight personal budget). Standard mode (default) is byte-identical to v2.1.0 behaviour. Canonical matrix and trade-off analysis documented in `agents/README.md §"Low-cost mode"`. Transformer is a pure function (`transformAgentFile` in `cmd/install/modes.go`); manifest stores transformed hashes so same-mode re-installs report `unchanged` and cross-mode re-installs report `conflict` (operator must delete + re-run with `--force`). New `cmd/install/modes.go` + `cmd/install/modes_test.go` (16 new tests covering matrix invariants, all-agents transform, body-preservation, edge cases, and AC-5 re-install scenarios).

### Changed

- **Installer now prompts for install mode** (`standard` / `low-cost`) after the Memory MCP setup step. Default is `standard` — behaviour is byte-identical to v2.1.0 for operators who accept the default or leave `INSTALL_MODE` unset. Non-interactive installs with `INSTALL_MODE` unset continue to behave as standard.

## [2.1.0] - 2026-05-21

### Added

- `cmd/install/prompts.go`: installer URL prompt now supports **smart-paste of the full mcpServers.memory JSON snippet** from the context-harness-mcp `/dashboard`. When the input starts with `{`, the installer assembles the rest of the snippet across stdin lines until braces balance (with a `snippetMaxLines = 100` safety cap), parses it with `encoding/json`, and extracts both URL and Bearer in a single operation — the subsequent bearer prompt is then skipped. Bare URL input still works as before. New helper `extractFromSnippet` handles the JSON walk with targeted error messages (missing `mcpServers` / `memory` / `url`, malformed JSON, non-Bearer auth scheme). `readLine` migrated to a shared package-level `bufio.Scanner` so multi-line stdin buffering is preserved between calls (a new scanner per call was discarding buffered lines). Coverage: 7 new unit tests in `preservation_test.go` for `extractFromSnippet` (full dashboard shape · no headers · malformed JSON · missing `mcpServers` / `memory` / `url` · non-Bearer auth scheme). Pairs with the matching dashboard render in context-harness-mcp PR #48 — copy once → paste once → wired up.

### Changed

- **Repo renamed from `claude-dev-team` to `team-harness`.** Documentation, installer copy, GitHub URLs (`bin/install.sh`, `bin/install.ps1`), `go.mod` module path, and code-level identifiers updated to the new slug. New `## Roadmap` section in `README.md` declares the long-term direction: today the harness is Claude-Code-specific by construction; a future v2 introduces a runtime abstraction so the same agents + skills + hooks can target other agentic systems (OpenAI Assistants, LangGraph, local-model harnesses) without rewriting prompts. Brand alignment with the sibling product `context-harness-mcp` (both `*-harness` now). Backwards compatibility: GitHub redirects the old `claude-dev-team` URL automatically; the manifest file `~/.claude/.claude-dev-team-manifest.json` keeps its name to avoid breaking existing installs (rename deferred to v2 when a migration path lands). Historical CHANGELOG entries are NOT rewritten.

### Added

- `cmd/install/prompts.go`, `cmd/install/claude_json.go`: installer now captures the optional Memory MCP **Bearer token** in the same run as the URL — one installer invocation configures everything needed for an auth-protected MCP (e.g. `context-harness-mcp` on Railway). Sources in priority order: existing `headers.Authorization` (Keep flow preserves it), `MEMORY_MCP_BEARER` env var (CI/scripted installs), interactive prompt after the URL prompt (Enter to skip = unauthenticated). `MemoryMCPChoice` gains a `BearerToken string` field; `buildMemoryEntry` writes `headers.Authorization: "Bearer <token>"` when set. `mergeMCPEntry` now does a nested overlay of `headers` so existing custom headers (e.g. `X-Custom-Proxy`) survive when only `Authorization` is updated. Coverage: 9 new tests in `cmd/install/preservation_test.go`.
- `agents/delivery.md`: new **Step 11.5 — Persist a process-insight to the knowledge graph (passive capture)**. After the PR is created/updated, the delivery agent calls Memory MCP `create_nodes` once with `nodeType: "process-insight"`, synthesising one node from the session-docs + CHANGELOG entry. Best-effort: if the Memory MCP server is unreachable, the task is pure docs/chore with no reusable learning, or the call returns a `policy/*` code, the step logs the skip and continues — delivery never fails on KG errors. Hard guardrails on content (technical-only, no PR/branch/commit metadata that rots, no restatement of the CHANGELOG, each observation ≤ 280 chars). Optional `session_id` attribution when `session-docs/{feature}/session.json` is present (forward-compat with `context-harness-mcp` Phase 4 sessions — orchestrator does not yet call `session_start`, so the field is omitted in practice today). Status block gains `kg_passive_capture: written | skipped: <reason> | failed: <error>`.
- `CLAUDE.md §5`: new architectural-conventions bullet documenting the KG passive-capture pattern at the team level (one process-insight per completed task, synthesised by `delivery`, best-effort).
- `docs/knowledge.md`: `[patrón]` bullet recording the passive-capture pattern (v0.5.0+).

### Fixed

- `cmd/install/claude_json.go`: installer no longer drops operator-set fields on `mcpServers` entries when running re-install. The previous behavior used byte-equality in `rawEntryMatches` and built memory entries with only `{type, url}` — so any operator-added `headers.Authorization` (Bearer for a remote auth-protected MCP like `context-harness-mcp` on Railway) was silently overwritten on every re-run, breaking the auth path. New behavior: `rawEntryMatches` checks subset semantics (existing entry satisfies all desired keys; extras tolerated), and when a real update is needed `mergeMCPEntry` overlays only the installer-owned fields on the existing entry. Headers and any other operator config survive. Regression covered by `TestRegisterMCPServers_PreservesMemoryHeaders` and `TestRegisterMCPServers_MergesHeadersOnURLChange` in `cmd/install/preservation_test.go`.

### Changed

- BREAKING (contract, not behavior): `agents/orchestrator.md` "Dispatch-blocked exit" — the response top-level Claude reads now contains a machine-parseable `dispatch_handoff` JSON block (schema_version 1) with the variable fields (`probe_error`, `phase`, `autonomy`, `round`, `next_dispatch`, `state_ref`) instead of a ~150-line prose playbook. The canonical takeover protocol moves to `CLAUDE.md §13 Universal rule — auto-takeover on blocked-no-dispatch`, single source of truth. Reduces handoff payload from ~3k tokens to ~300 tokens, eliminates prose-drift between the two locations. Same JSON block is embedded in the `## Handoff` section appended to `00-state.md` (for recovery flows). Fixes issue #14 (Option 4). `tests/test_agent_structure.py` updated to match new contract: now checks for `dispatch_handoff` JSON presence + `CLAUDE.md §13` cross-reference instead of the old `Takeover playbook` literal.

### Added

- `cmd/install/`: Go rewrite of the installer. 1:1 port of `bin/install.py`'s logic including the PR #7 preservation-of-existing-mcpServers behaviour. Cross-compiled binaries shipped as GitHub Release assets (`install-linux-amd64`, `install-darwin-arm64`, `install-darwin-amd64`, `install-linux-arm64`, `install-windows-amd64.exe`).
- `.github/workflows/release.yml`: cross-compile workflow triggered by `git tag v*`. Produces 5 platform binaries + SHA256SUMS and uploads as Release assets.
- `bin/install.sh` and `bin/install.ps1` rewritten as thin bootstrap wrappers — detect OS+arch, download the right binary from the latest GH Release, exec it. End-user no longer needs `uv` or Python.
- `go.mod`: claude-dev-team is now a Go module (`github.com/valianx/claude-dev-team`, Go 1.23).

### Removed

- BREAKING: `knowledge-graph/` directory (Python ChromaDB MCP server source). The Memory MCP server now lives EXCLUSIVELY as an external service — typically `context-harness-mcp` deployed to the user's chosen cloud host. `claude-dev-team` is now a pure agents + skills + hooks + Go-installer distributor.
- BREAKING: `shared-knowledge/` directory (drop-off for shared KG JSON exports). The export/import workflow was bundled with the Python ChromaDB server; with the server external, KG sharing is a non-goal of this repo. Operators who want cross-machine shared KGs use the external MCP's storage backend directly (e.g. shared Postgres) or roll their own export tooling.
- BREAKING: `skills/kg-viewer.md` slash command. The viewer it launched (`uv run knowledge-graph/viewer/app.py`) targeted the deleted Python ChromaDB server. The current external Memory MCP (`context-harness-mcp`) ships its own web viewer at `/viewer/` on the deployed host.
- `bin/install.py` (deprecated Python fallback). Deleted entirely — Go installer is the only path.
- `install_knowledge_graph()` from the installer (no more copying Python KG server files into `~/.claude/`).
- `uv` from required dependencies.

### Changed

- BREAKING: installer prompts simplified to a single Memory MCP URL question. Default is `http://localhost:7654/mcp` (local Docker). User pastes their cloud URL or hits Enter.
- Env var contract: `KG_BACKEND` removed; `CONTEXT_HARNESS_URL` renamed to `MEMORY_MCP_URL`. The installer always writes `mcpServers.memory = {type: "http", url: ...}`.
- `mcpServers.memory` preservation logic (PR #7) still accepts both http and legacy stdio shapes — existing installs with the legacy stdio entry are preserved unless `--force` is passed.

### Deprecated

- `bin/install.py`: deprecation header added. Continues to work for one more release as a fallback. Will be removed in the next major.

### Fixed

- `bin/install.py`: no longer clobbers existing `~/.claude.json` mcpServers entries on re-run. The installer now reads the current `mcpServers.memory` and `mcpServers.context7` entries first, treats them as the source of truth, and only writes when there's an actual change. Adds a `--force` flag for explicit reset. Fixes a real loss-of-config incident where re-running the installer with `KG_BACKEND=memory` + `CONTEXT7_API_KEY=ctx7sk-fake-test-key` (the values used in the manual test instructions) wiped a user's real config.

- **Orchestrator boot probe + dispatch-blocked exit (`agents/orchestrator.md`).** Replaced the "Mandatory acknowledge step" with a "Mandatory boot sequence" that runs a real `Task(general-purpose, "reply OK")` probe before any other action. If the probe succeeds, the existing flow continues (boot acknowledgment now reflects the probe result). If the probe fails with a "tool unavailable" variant — the recurring failure mode when the orchestrator runs nested as a subagent (e.g., invoked via `@orchestrator` mention or via a skill that routes through `Task(subagent_type=orchestrator)`), where the harness strips `Task` regardless of frontmatter — the orchestrator now takes a structured "Dispatch-blocked exit": writes `status: blocked-no-dispatch` to `00-state.md` (new enum value), appends a `## Handoff` section with the literal probe error and the exact next agent / phase / autonomy state, and emits a fixed response telling top-level Claude how to take over dispatch directly. Removes the wasted "discover the limitation in Phase 2 after spending tokens on a plan you cannot execute" cycle. Dispatch invariant #1 was reworded to be conditional on probe success.
- **Auto-takeover on `blocked-no-dispatch` (universal, no user prompt).** The orchestrator's Dispatch-blocked response was rewritten as a directive to top-level Claude rather than a status report to the user: starts with "Dispatch handoff — top-level Claude takes over now", embeds an explicit "do NOT ask the user / do NOT re-invoke `@orchestrator` / do NOT write agent session-docs inline" anti-pattern list, and a numbered "Takeover playbook" that top-level Claude follows mechanically (read state, read agent contract, dispatch via `Task`, parse status block, update `00-state.md`, continue through phases, respect STAGE-GATE-2 silently iff `autonomous: true`, respect STAGE-GATE-3 always). Same rule codified in `CLAUDE.md` § 13 "Subagent Orchestration" as the universal escalation rule for any entry mode (`@orchestrator`, every routing skill, agent referrals), and in `skills/README.md` as a "Continuity contract" section referenceable by all routing skills. Net effect: the user no longer needs to manually relay the handoff — the system self-heals regardless of how the command was invoked.
- **Regression coverage for "changes that break the harness".** Three new layers:
  - **Suite 19 of `tests/test_agent_structure.py`** — agent identity & cross-reference consistency (~113 assertions). Catches filename ↔ frontmatter `name:` drift (would cause Claude Code to load the wrong agent identity), orphan agents (exist in `agents/` but never referenced by the orchestrator's team table or standalone callout), dangling references (agent/skill names mentioned in CLAUDE.md or skills/README.md but with no corresponding file), unknown phase numbers in orchestrator.md, frontmatter `tools:` typos (e.g. `Tash` instead of `Task` — silent agent-load failure), and skill-routing line drift in `skills/README.md`. First run already caught one real omission: `agent-builder` was missing from orchestrator.md's standalone agents callout — fixed atomically with the suite.
  - **`tests/test_orchestrator_boot_behavioral.sh`** — first end-to-end behavioral test (10 assertions, ~78K tokens / ~$1 per run, ~10s). Dispatches the orchestrator via `claude -p` and asserts the boot probe + dispatch-blocked exit behave correctly when the agent runs as a nested subagent. Captures the literal harness error fingerprint (`"No such tool available: Task. Task is not available inside subagents."`) so future platform changes are detectable. Three hallucination guards lock down the "Task is present" / "tools confirmed:" / "subagent dispatch is available" patterns that the prose was previously priming.
  - **`tests/run-behavioral.sh`** — wrapper for behavioral tests (any `tests/test_*_behavioral.sh`). Not bundled into `tests/run-all.sh` because behavioral tests cost API tokens. Documented in `tests/README.md` with a "when to run which" matrix (pre-commit → free suite; release / contract edits / claude upgrade → both).
- **Removed the hallucination-priming "Task is on the list. You have Task." prose.** Empirical finding from a controlled boot test: when the `## Available tools in this invocation (authoritative)` section made unconditional claims ("Task is on the list. You have Task. You can dispatch subagents."), the orchestrator emitted a hardcoded `[orchestrator boot] tools confirmed: ... Task is present — subagent dispatch is available` line as its opening response **even when Task had actually been stripped at runtime** — a hallucination cascade primed by the contradictory prose. The first Test B run captured this: the agent contradicted itself within one response ("Task is present" followed by "I notice Task is not actually in my available tools"). Section renamed to `## Tools in this invocation`, rewrites the framing as "this is the **declared** toolset, not a runtime guarantee", explicitly forbids opening claims about Task availability before the boot probe runs, and names the failure-cascade pattern so the model recognises and avoids it. The boot acknowledgment line in Step 2 (probe success) was also rephrased from "tools confirmed: …" to "dispatch probe OK — subagent dispatch verified by general-purpose probe" so it cannot be reflexively emitted from training memory. Second Test B run confirmed the fix: the agent now attempts the probe (1 tool use vs 0 before), captures the literal harness error `"No such tool available: Task. Task is not available inside subagents."`, takes the dispatch-blocked exit branch cleanly, and emits no hallucinated opening line. Suite 18 of `tests/test_agent_structure.py` extended with 5 new assertions (319 total) to lock down the hallucination-prevention prose against regression.

## [1.1.0] - 2026-05-17

Backend-agnostic naming for the knowledge-graph subsystem. The capability stays the same; the implementation (ChromaDB) is now decoupled from the user-facing surface so a future backend (cloud-hosted KG, alternative vector DB) can be swapped in without sed-across-the-repo.

### Changed (knowledge-graph naming made technology-agnostic)

- **Folder rename:** `chromadb-mcp/` → `knowledge-graph/` via `git mv` (history preserved). Installer copies to `~/.claude/knowledge-graph/` instead of `~/.claude/chromadb-mcp/`. The MCP server identifier in `~/.claude.json` (`mcpServers.memory`) is unchanged — it was already abstract.
- **User-facing docs** swept across `README.md`, `CLAUDE.md`, `agents/*.md`, `skills/*.md`, `docs/*.md`, `shared-knowledge/*.md` to replace implementation-tied phrasing (`ChromaDB MCP tools`, `ChromaDB-backed`, `chromadb-mcp/` paths) with capability-based phrasing (`Knowledge Graph MCP tools`, `knowledge-graph/` paths, "current backend: ChromaDB" only in three intentional factual contexts).
- **Internal impl files** in `knowledge-graph/` retain ChromaDB references (`server.py`, `pyproject.toml`, `migrate_knowledge.py` — they're the implementation, that's correct). `pyproject.toml` project name renamed `chromadb-mcp` → `knowledge-graph`; description reframed to "current backend: ChromaDB". `manage-server.sh` primary env var `KNOWLEDGE_GRAPH_DIR` with legacy `CHROMADB_MCP_DIR` honoured as fallback through 1.x for users who already set it in their shell config.
- **Installer migration:** new `detect_legacy_chromadb_mcp()` function surfaces the orphaned `~/.claude/chromadb-mcp/` folder on 1.0.x → 1.1.0 upgrades, prints the platform-appropriate cleanup command (`Remove-Item -Recurse -Force` on Windows, `rm -rf` on Unix), and notes that persistent KG data at `~/.claude/chromadb/` is unaffected. Does NOT auto-delete — `~/.claude/` is owned by the user, the installer's no-overwrite contract extends to no-delete.
- **Suite 17 of `tests/test_agent_structure.py`** scans every user-facing markdown file for forbidden phrases (`ChromaDB MCP tools`, `ChromaDB MCP server`, `ChromaDB MCP `` ` ``, `ChromaDB-backed`, `chromadb-mcp`) and reports violations by file path. CHANGELOG and `knowledge-graph/` are intentionally excluded. Suite total: 282 → 287 assertions.

### Changed (README — harness framing + functional walkthrough)

- **`README.md`** rewritten with the harness framing made central and the layout improved for scan-ability. New title `# Claude Dev Team` (display name). New "What this is" section names it explicitly as a harness around Claude Code, not a prompt pack. New "How it works" section is a functional walkthrough — three short paragraphs describing what happens when you ask for a feature (Stage 1 → STAGE-GATE-1 → Stage 2 with parallel PR rounds → STAGE-GATE-2 → Stage 3 → STAGE-GATE-3 → push), instead of a phase-by-phase contract table. New "Why a harness" failure-mode table maps each pain point to the corresponding patched behaviour. Install section compressed to ~6 lines with a single quote-block for less common variants. Component summary (`What's inside`) reduced from per-section detail to a one-paragraph overview plus three compact sub-sections that link out to the canonical references (`agents/README.md`, `knowledge-graph/README.md`, `docs/kg-content-policy.md`).

## [1.0.0] - 2026-05-17

First stable release. The system is in productive use across multi-repo migrations; the agent contracts, session-docs hygiene rules, and gating policy are settled enough to commit to a 1.x line. Anything that breaks these contracts now goes through a major bump.

Highlights of this release (cumulative from all the `[Unreleased]` entries below):

- **Mandatory Working Agreements** baked into the CLAUDE.md template + dogfooded here. Pre-work, during-work, post-work, governance, and anti-pattern rules visible from every project.
- **Stage 1 → Stage 2 boundary hardened**: Phase 1.6 plan-review is now inviolable (inline fallback when subagent invocation fails), session-docs hygiene guardrails on qa/architect/orchestrator (no parallel review files, no iteration history in analysis docs), bidirectional cross-references for split PRs, self-describing task list (Status field + AC checkbox mirror).
- **Knowledge graph vocabulary expanded** (project, service, stack-profile entities; belongs-to/calls/uses-stack/depends-on relations; 4 subagents granted read-only KG access; `docs/knowledge.md` cross-link).
- **Tests/run-all.sh** wraps three suites: policy-block (~48 cases), structural integrity (~282 assertions across 16 suites), YAML frontmatter validity (~19 agents). Catches the silent-agent-drop class of bug.

### Added (Self-describing task-list contract — Status field + AC checkbox mirror)

- **`agents/architect.md`** task-list template now mandates a `**Status:** pending` field on every PR section in `02-task-list.md` (immediately after `Title:`). New `## Self-describing task-list contract` block enumerates the 5 valid Status values (`pending | in-progress | verified | merged | blocked`), names the agent that owns each transition, and pins a hard rule: post-STAGE-GATE-1 the only mutations allowed on `02-task-list.md` are the `Status:` field (orchestrator/delivery) and AC checkbox flips (qa). All other fields are frozen.
- **`agents/orchestrator.md` Phase 2** declares "Mirror PR-level progress into `02-task-list.md`" — a transition table that maps Phase 2 start to `in-progress`, Phase 3.5 PASS to `verified`, Phase 4 delivery to `merged`, dependency block to `blocked`. The mirror runs in lock-step with `prs_in_current_round` / `prs_completed` updates in `00-state.md`. Delivery is the only agent that flips `verified → merged`.
- **`agents/qa.md`** validate-mode now mandates an AC-checkbox mirror on `02-task-list.md`: every AC verdict `PASS` in `04-validation.md` flips its matching `- [ ] **AC-X.Y.Z**: …` to `- [x]` (matched by exact AC identifier; never edits anything else on the line). `FAIL` keeps the box unchecked. Regressions can re-flip and must be logged in the failure brief. This is the **only** edit qa is allowed to make on `02-task-list.md`.
- **`agents/implementer.md`** explicitly states it never writes to `02-task-list.md` — Stage 1 contract is frozen for it. Implementer output remains `02-implementation.md` plus the code changes; orchestrator owns `Status:`, qa owns the checkbox mirror.
- **16 new Suite 16 assertions** in `tests/test_agent_structure.py` cover: architect template includes Status, all 4 transition Status values enumerated (in-progress, verified, merged, blocked), Self-describing contract section present, post-gate write scope pinned, qa AC-mirror contract present, qa edit scope restricted, orchestrator mirror table present and naming all transitions, delivery owns the merged transition, implementer disclaims the write. Suite total: 266 → 282 assertions.
- **Rationale:** Mario observed that PR-level progress lived in `00-state.md` while `02-task-list.md` had AC checkboxes that nobody marked and no Status field at all — a reader opening the task list standalone could not tell what was done without cross-referencing two other files. Same self-describing anti-pattern flagged earlier in the bidirectional cross-references work. See `feedback_self_describing_task_list.md` in memory.

### Fixed (plan-reviewer subagent silently unregistered due to YAML parse error)

- **`agents/plan-reviewer.md` frontmatter `description:` value** contained an unquoted `": "` (colon-space) sequence — `"plan-shape rules: one PR per service"` — which YAML parses as the start of a nested mapping, breaking the whole frontmatter. Claude Code's harness handles the parse failure by silently dropping the agent from the registered `subagent_type` list. Result: `Task(subagent_type='plan-reviewer')` failed with `"Agent type 'plan-reviewer' not found"` and Phase 1.6 stalled in every pipeline using the plan-shape audit. Replaced the `": "` with `" — "` (em-dash) — same semantics, valid YAML. The agent now registers correctly on next session start.
- **New test suite `tests/test_agent_frontmatter.py`** validates every `agents/*.md` frontmatter parses as YAML via PyYAML and contains the required `name`, `description`, `model` keys. Wired into `tests/run-all.sh` as Suite 3. Catches this entire class of "silent agent drop" issues — any future agent whose frontmatter fails to parse fails the test instead of silently disappearing at runtime. 19/19 agents currently pass.

### Added (Phase 1.6 inline fallback + inviolable gate)

- **`agents/orchestrator.md` Phase 1.6** now declares two new contracts: (a) `01-plan-review.md` MUST exist with a `## Verdict` line before STAGE-GATE-1 is emitted — the orchestrator never punts the plan-shape audit to the human; (b) when `Task(subagent_type='plan-reviewer')` fails with nesting refusals (literal errors: *"plan-reviewer not available as subagent_type"*, *"Task is not available inside subagents"*), the orchestrator MUST execute the 5-rule audit inline using `agents/plan-reviewer.md` as the procedure spec, write `01-plan-review.md` with the same schema, and continue. Inline and subagent executions share the same max-3 iteration budget. Status block carries `mode: subagent | inline` for telemetry.
- **Rationale:** the harness limits Task nesting depth; when the orchestrator runs as a subagent (e.g. via `/recover` or `/design` skill routing), it could not spawn `plan-reviewer`. Before this change, that silently turned the 3-stage pipeline's agent-then-human contract into human-only review — exactly the failure mode `[[feedback-pipeline-gates]]` was meant to prevent. The inline fallback preserves the contract under all harness configurations.
- **6 new assertions** in `tests/test_agent_structure.py` Suite 16 cover: inviolable-gate declaration, required `01-plan-review.md` presence before STAGE-GATE-1, inline-fallback section with both literal error strings, procedure spec pointer to `plan-reviewer.md`, telemetry mode field, shared iteration budget across both modes. Suite total: 244 → 266 assertions.

### Added (Session-docs hygiene guardrails on qa, architect, orchestrator)

- **`agents/qa.md`** now has two explicit sections near the top: `## Files I write (exhaustive)` (one canonical output per mode) and `## Files I MUST NOT write` (hard ban on sibling review files — `01-coverage-review.md`, `02-flow-coverage.md`, `qa-reports/PR-*.md`). When asked to "review the plan" the agent routes plan-shape concerns to `plan-reviewer` and substance refinement back to `architect` instead of improvising filenames. Triggered by a real failure mode observed in a downstream pipeline that accumulated parallel review docs the user then had to read alongside the plan.
- **`agents/architect.md`** gains `## Forbidden output patterns` listing the no-history rule explicitly: no version markers in the body (`v6 — 2026-05-14`), no "Previously decided X, now Y" passages, no strikethrough, no appended changelog inside the analysis doc, no timestamp suffixes inside phase headers. The architect overwrites affected sections of the same file instead of creating siblings (`01-architecture-v2.md`) or appending "Round N" suffixes. A soft size warning fires when an analysis doc exceeds 30 KB / 800 lines.
- **`agents/orchestrator.md`** intent table gains a `plan-review` row that matches "revisa el plan / review the plan / audit my plan / is my plan compliant?". A disambiguation note follows the table: validate vs plan-review vs substance refinement get routed to different agents; substance refinement of a plan **must never** be delegated to `qa`.
- **Suite 16** appended to `tests/test_agent_structure.py` (16 assertions covering the new sections + routing + retained max-3 plan-review budget). Brings the suite from 244 to 260 assertions.

### Added (Mandatory Working Agreements section in CLAUDE.md template)

- **New `## 6. Mandatory Working Agreements` section** in the CLAUDE.md template generated by `agents/init.md` Phase 3. Contains 17 imperative rules across 5 sub-blocks: Pre-work (3), During-work (4), Post-work (4), Governance (3), Anti-patterns (3). Same boilerplate in every repo — no per-project adaptation. Former §6-§18 of the init template renumbered to §7-§19; §17 (formerly §16 Git & Delivery Conventions) reduced to a one-line pointer to §6.
- **Upgrade path for existing CLAUDE.md files:** `init` detects the section by exact heading match, inserts it after `## 5. Architectural Conventions` if absent, leaves it alone if present, surfaces an explicit status line — never auto-renumbers the rest of the file.
- **Dogfood:** this repo's own `CLAUDE.md` gains the same §6 block (former §6-§14 renumbered to §7-§15; §12 "Git & Delivery Conventions" reduced to a pointer).
- **Two agent cross-references:** `agents/delivery.md` Step 5 and `agents/orchestrator.md` Phase 0a Step 2b now visibly link to §6 Mandatory Working Agreements (documentation-only — no rule duplication).
- **Suite 15** appended to `tests/test_agent_structure.py` (10 assertions: init template body, verbatim §6 heading, 5 sub-block headings, delivery cross-reference, orchestrator cross-reference, CHANGELOG entry).

### Added (KG vocabulary expansion — topology types, relation types, subagent read access, docs cross-link)

- **KG entity vocabulary expanded** from 6 to 9 types. Three new entity types added to Phase 6: `project` (repository-level inventory, named after bare repo), `service` (deployable-level: API, worker, frontend), `stack-profile` (reusable technology combination for a project archetype). Existing types (`pattern`, `error`, `constraint`, `decision`, `tool-gotcha`, `process-insight`) are unchanged — backward compatible because ChromaDB stores `entityType` as free-text metadata.
- **KG relation vocabulary expanded** with 4 new types: `belongs-to` (service → project), `calls` (service → service, runtime IO), `uses-stack` (project → stack-profile), `depends-on` (service → service, build/deploy ordering). Each type has explicit from/to pairs and save triggers documented in Phase 6 of `agents/orchestrator.md`. Legacy `relates_to` remains valid as the generic edge.
- **Save triggers subsection** added to Phase 6 of `agents/orchestrator.md`. Explicit conditions for when to emit each new entity type and relation type (e.g., "save a `service` entity when the pipeline added a new deployable", "save a `calls` relation when the pipeline added cross-service IO").
- **Phase 6 entity budget relaxed** from a hard cap of 3 to a soft cap of 5 (up to 7 acceptable when topology entities are involved). Quality enforcement moves from the numeric count to dedup (`search_nodes` before `create_entities`) and the content-policy filter (`docs/kg-content-policy.md`). Relations do not count against the budget.
- **Four subagents granted read-only KG access:** `architect`, `qa`, `tester`, `security` each gain `mcp__memory__search_nodes` and `mcp__memory__open_nodes` in their `tools:` allowlists. Each agent gains a `## Knowledge Graph Access (Read-Only)` section with agent-specific when-to-query triggers and an explicit write-prohibition rule. Writes remain centralized in orchestrator Phase 6.
- **Defensive tools: allowlist update for orchestrator.** All 9 `mcp__memory__*` tools added to `agents/orchestrator.md` frontmatter `tools:` to match actual KG usage in Phase 0a and Phase 6, removing the silent-inheritance assumption.
- **`docs/knowledge.md` cross-link:** Phase 6 of `agents/orchestrator.md` now appends a `[kg]` bullet to `docs/knowledge.md` for every entity saved this run (only if the file exists). `agents/delivery.md` Step 5b documents the cross-link format and dedup rules. Keeps the two memory surfaces — project-local `docs/knowledge.md` and the cross-project KG — aligned without duplicating content.
- **`/memory` skill documentation aligned** with the 3 new entity types. `list`, `stats`, and the usage help block now enumerate `project`, `service`, and `stack-profile` as valid type filters. No behaviour change — the filter already accepts free-text types and `stats` already auto-aggregates from `read_graph`.

### Added (human-readable state surface — TL;DR + Stage column + narrative timeline)

- Added `## TL;DR` section at the top of `00-state.md` (rewritten in place at every phase transition by the orchestrator — no version markers, no "previously", no append). The section has four fixed-named bullets (`Now` / `Last` / `Next` / `Open issues`), each ≤ 200 characters, covering what the pipeline is doing right now, the most recent milestone, the next phase/gate, and any open blockers. Extended `/status` (no args) with a `Stage` column (values `1` / `2` / `3` / `—` for legacy) positioned between `Feature` and `Phase`, and a refined `Status` enum that distinguishes `waiting_gate_1`, `waiting_gate_2`, `waiting_gate_3`, `autonomous`, `iterating`, `complete`, and `paused` by cross-referencing `phase` and `autonomous` fields. Extended `/status <feature>` to render a chronological **narrative timeline** derived from `00-execution-events.jsonl` — events are grouped into round blocks for parallel-PR runs, rendered with ASCII glyphs, and the renderer is strictly read-only (no Edit, no Write). Graceful degradation: missing JSONL, legacy pipelines, and absent TL;DR sections never crash — each condition has an explicit fallback message.

### Added (3-stage pipeline gates + plan-reviewer agent + per-PR task list contract)

- **New agent `agents/plan-reviewer.md`** (sonnet, read-only — `Read, Glob, Grep, Write` only; no `Bash`, no `Edit`). Audits Stage 1 analysis artifacts (`01-architecture.md` + `02-task-list.md`) against five plan-shape rules before the human ever sees the plan: (1) one PR per service unless `Split reason:` cites a value from the closed list `{coexistence window | production signal | cross-repo deploy gate}` — OAS bump alone, "logical separation", "reviewability", "cleaner this way" are explicitly rejected; (2) every PR has ≥1 acceptance criterion in `Given/When/Then` or `VERIFY:` format; (3) documents are consolidated final versions — no version markers, no strikethrough, no "previously decided / previously said / previously proposed", no inline changelog sections, no timestamped section headers (other than the top-level `**Date:**`), no `Edit:`/`Update:` paragraph prefixes, no `WIP`/`TODO`/`FIXME`; (4) cross-reference integrity (`02-task-list.md` references `01-architecture.md`; every Work Plan file appears in some PR's `Files:`); (5) service identity (`Services Touched` in `01-architecture.md` equals the union of `Service:` across all PRs). Emits `pass | concerns | fail` verdict; `fail` only on rules 1-2, `concerns` on rules 3-5. Block-quote-tolerant for user-quoted content. Honours `Plan-reviewer override:` notes from the architect by degrading `fail` to `concerns` and surfacing the override at the human gate.
- **New artifact `02-task-list.md`** produced by `architect` in design mode alongside `01-architecture.md` (dual-output contract). Schema: one section per PR with `Service:`, `Title:`, `Branch (suggested):`, `Files:`, `Split reason:` (only if >1 PR for the same service), `Depends on:`, `Notes:`, and an `Acceptance Criteria` block with Given/When/Then (or `VERIFY:`) per AC. The union of per-PR ACs must cover every feature AC in `00-task-intake.md`. Consumed by `implementer` (per-PR `Files:` scope and AC contract), `qa` validate-mode (per-PR AC validation), and `plan-reviewer` (Phase 1.6 audit). The architect must also add a `## Services Touched` section to `01-architecture.md` enumerating every service the feature touches.
- **Three pipeline stages with mandatory human gates in `agents/orchestrator.md`.** Layered on top of the existing 7-phase numbering (no phase renumbering). Stage 1 (analysis) = Phases 0a / 0b / 1 / 1.5 / 1.6, closed by `STAGE-GATE-1`. Stage 2 (implementation, run once per PR) = Phases 2 / 2.5 / 3 / 3.5 / 3.6, closed by `STAGE-GATE-2` between PRs. Stage 3 (delivery) = Phases 4 / 4.5, closed by `STAGE-GATE-3`; then Phases 5 / 6 run after approval. `STAGE-GATE-1` and `STAGE-GATE-3` are **mandatory and non-skippable** in any mode (Stage 3 push is irreversible). `STAGE-GATE-2` is the only gate the user can disable, and only by typing `approve autonomous` at `STAGE-GATE-1` (or `next autonomous` at any `STAGE-GATE-2`) — there is no CLI flag, no environment variable, no skill-level activation. The gate phrase is the single activation vector by design: autonomy is granted AT the gate where the human has the plan-reviewer's verdict in front of them.
- **New Phase 1.6 — Plan Review** in `agents/orchestrator.md`. Inserted between Phase 1.5 (qa ratify-plan, substance coverage) and `STAGE-GATE-1`. Invokes `plan-reviewer`, gates on `verdict` (separate field from `status`). `verdict: fail` routes back to architect with the failing rules and runs a separate max-3 iteration budget; `verdict: concerns` surfaces inline at the gate; `verdict: pass` advances cleanly.
- **Stage 2 DAG scheduler (paralelismo intra-feature respetando `Depends on:`)** in `agents/orchestrator.md`. Phase 2 → 2.5 → 3 → 3.5 → 3.6 is the per-PR cycle, but the orchestrator does NOT iterate PRs sequentially. It builds a directed acyclic graph from each PR's `Depends on:` field in `02-task-list.md` and computes rounds topologically: Round 1 = PRs with `Depends on: none`; Round N = PRs whose deps are fully contained in completed rounds 1..N-1. PRs within the same round run **in parallel** in separate worktrees (same mechanism as Parallel Dispatch Flow). When all PRs of a round complete, STAGE-GATE-2 fires once per round (not per PR) with the round summary listing every parallel PR and the next round's schedule. Sequential fallback: if every PR has a chained `Depends on:`, the DAG degenerates into a line and rounds become 1-PR rounds — identical to legacy sequential behaviour. Per-PR scoping, SCOPE-DRIFT annotation and the per-PR Acceptance Gate (Phase 3.5) are unchanged.
- **Partial-round failure handling** in `agents/orchestrator.md`. If any PR in a round fails after exhausting its iteration budget, sibling PRs in flight complete normally (no cancellation — preserves their work). The orchestrator emits `stage.gate stage: 2 verdict: partial-fail`, lists failing and completed PRs, and escalates to the user. Subsequent rounds wait until the failed PR is resolved via the `redo PR-{i}` reply at the gate.
- **Autonomous Mode section in `agents/orchestrator.md`** documenting activation (only via `approve autonomous` / `next autonomous` at a gate), what it skips (`STAGE-GATE-2` only, between PRs), what it NEVER skips (`STAGE-GATE-1`, `STAGE-GATE-3`, iteration loops on real failure, hard errors), and persistence in `00-state.md` via `autonomous: true|false` + `autonomous_granted_at: STAGE-GATE-1 | STAGE-GATE-2-after-PR-{N}` fields. Survives `/recover`.
- **Backward compatibility via explicit pipeline versioning.** `00-state.md` now carries `pipeline_version: 2` written at Phase 0a Intake by the new orchestrator. Pre-refactor pipelines (`pipeline_version: 1` or field absent) cause the orchestrator to log one warning line and skip Phase 1.6 + `STAGE-GATE-1`, falling back to the legacy contract for the rest of the pipeline. `qa` validate-mode and `implementer` both have legacy fallback paths that read the feature-wide AC list from `00-task-intake.md` when `02-task-list.md` is absent.
- **JSONL events for stage gates** in `agents/orchestrator.md`. New event types: `stage.gate` (emitted when a `STAGE-GATE-N` STOP block fires; supports `verdict: partial-fail` for stage 2), `stage.gate.release` (user reply at a gate with `decision: approved|approved-autonomous|rejected|edit|next|next-autonomous|stop|redo|ship|amend|abort`), `stage.gate.skipped` (silent skip with `reason: autonomous|legacy`). New fields on the existing schema: `stage`, `decision`, `after_round` (round-granularity for stage 2 events), `round_prs` (list of PR identifiers in the round), `reason`.
- **Plan Review direct mode** in `agents/ref-direct-modes.md`. Standalone invocation of `plan-reviewer` against an existing `01-architecture.md` + `02-task-list.md` pair after a manual edit, without re-running the full pipeline. Read-only; prints verdict and findings inline; does NOT emit a `STAGE-GATE-1` STOP block (no pipeline to gate).
- **Plan-flow distinction (`01-planning.md` vs `02-task-list.md`)** in `agents/ref-special-flows.md`. Planning mode (used by `/plan` / `/plan plan-and-execute`) keeps producing `01-planning.md` for multi-task batch orchestration with dispatch labels. Design mode (normal pipeline) produces `02-task-list.md` for sequential per-PR delivery. The two artifacts have different consumers and different schemas — they coexist. In `plan-and-execute`, the parent batch orchestrator gates at task boundaries via the multi-task progress tracker; per-task child orchestrators apply Stages 1/2/3 inside each worktree. **No double-gating.**
- **Refactor-flow continuity** in `agents/ref-special-flows.md`. The dual-output contract and 3-stage gates apply to refactor type tasks; per-PR ACs predominantly use the `VERIFY:` format and `plan-reviewer` Rule 2 accepts both formats.
- **Test coverage for the refactor** in `tests/test_agent_structure.py`. New `plan-reviewer` entries in `EXPECTED_AGENTS` and `READ_ONLY_AGENTS`. New Suite 12 (~30 assertions) covering: plan-reviewer self-contract (5 rules, closed list of temporal-prod reasons, forbidden patterns, override mechanism, verdict in Return Protocol), architect dual-output + Services Touched + temporal-prod reasons, qa per-PR scoping + Phase 1.5 vs 1.6 distinction, implementer per-PR scoping + SCOPE-DRIFT, ref-direct-modes Plan Review mode, ref-special-flows plan/design-mode distinction + no double-gating, agents/README.md roster, top-level README STAGE-GATE-{1,2,3} + plan-reviewer + 17 agent count. Suite 3 (orchestrator.md) extended with Phase 1.6, STAGE-GATE-1/2/3, Stage labels, Autonomous Mode section, `approve autonomous`, `pipeline_version`, plan-reviewer in team, `02-task-list.md` / `01-plan-review.md` artifacts, `stage.gate*` event types, and mandatory-ness declarations for GATE-1 / GATE-3. Append-only per CLAUDE.md § 9.
- **README + agents/README updates.** Top-level `README.md` agent count bumped to 17, pipeline diagram replaced with the 3-stage view, new phase highlights documented (Plan Review 1.6, STAGE-GATE-1/2/3, dual-output design). `agents/README.md` roster gains the `plan-reviewer` row (sonnet, medium, read-only allowlist).
- **Human-readability layer on Stage 1 artifacts.** Two top-of-document sections are now MANDATORY on `01-architecture.md`: `## TL;DR` (3-6 lines, hard cap 10) summarising what is proposed, scope, principal risk and deferred work in plain prose; `## Decisions for human review` (3-5 bullets, hard cap 7) listing only decisions that require human judgement — irreversible moves, business-rule trade-offs, ambiguous spec interpretations — each ending with `→ decided as X` or `→ open question`. Mechanical pattern picks, framework conventions, and default best practices do NOT belong here. If zero decisions need human judgement, the architect writes the explicit single bullet "No human-judgement decisions required — all trade-offs follow established project patterns. → decided" (valid value, plan-reviewer accepts it). `02-task-list.md` now also opens with a MANDATORY `## Summary` table (PR / Service / Files / AC count / Depends on / Split reason, rows in DAG order). Together these three sections form the human's entry point at STAGE-GATE-1.
- **STAGE-GATE-1 STOP block surfaces the entry points inline** in `agents/orchestrator.md`. The orchestrator copies the `## TL;DR` and `## Decisions for human review` from `01-architecture.md` plus the `## Summary` table from `02-task-list.md` verbatim into the gate STOP block. The reviewer no longer needs to open the file to decide. Protection rule: if `## Summary` exceeds 12 rows, render only the first 10 plus a `… +{N-10} more` line so the gate stays scannable on giant batch features. This is the only place the orchestrator does a small Read from session-docs on the happy path (otherwise gates are status-block-driven only).
- **Plan-reviewer Rule 6 enforces the human-readability sections** in `agents/plan-reviewer.md`. Missing `## TL;DR`, missing `## Decisions for human review`, or missing `## Summary` table → `fail` (the human has no entry point). Overflow (>10 TL;DR lines, >7 decision bullets) → `concerns`. Out-of-order sections (TL;DR not first, Decisions after Documentation Consulted) → `concerns`. Override mechanism: `Plan-reviewer override: Rule 6 — {justification}` degrades `fail` to `concerns`. Verdict calibration updated: `pass` requires all six rules, `fail` triggers on rules 1/2/6-missing without override. Return Protocol gains `rule-6` count and a `human_entry_points` object (tldr/decisions/task_list_summary booleans).

### Added (URL anatomy contract — implementer + reviewer + KG)

- **URL anatomy rule in `agents/implementer.md`.** New Non-Negotiable bullet alongside Secrets / Performance / DRY: `BASE` (scheme + host + port + base prefix; environment-specific; lives in `.env*`) and `PATH` (endpoint route + query; code-specific; defined by the contract / OpenAPI spec / route file) must never mix. Code MUST NOT hardcode `BASE` — read from an env var (`API_BASE_URL`, `<SERVICE>_URL`); `.env*` files MUST NOT contain endpoint paths. Diagnostic discipline on a 4xx / connection failure: classify before changing — wrong host/port/scheme is a `BASE` problem (fix the env), wrong path/method/query is a `PATH` problem (fix code or contract); a path the gateway (Apigee, ingress, BFF) rejects while the backend accepts it almost always means the spec / contract was not re-registered, NOT that the URL in client code is wrong. One concern per PR: a diff that modifies endpoint paths must not also modify `.env*` without explicit justification. Phase 3 self-review checklist gains a matching `URLs follow BASE/PATH separation` item.
- **URL & Environment Configuration analysis category in `agents/reviewer.md`.** New section in Phase 1 between Security and Performance. Flags hardcoded host / scheme / port literals in code (CRITICAL — blocks per-environment deploy), endpoint paths inside `.env*` files (CRITICAL — breaks the assumption that envs are interchangeable), and PRs that mix endpoint-path changes with `.env*` changes (SUGGESTION — request a split or justification). Adds a gateway / spec sync check: when a PR adds or modifies endpoints behind a gateway (Apigee, ingress, BFF), confirm the contract / OpenAPI spec is updated and version-bumped in the same PR; otherwise the gateway will reject the new path even when the backend accepts it, and the user will be tempted to "patch the URL" in client code instead of fixing the contract.
- **`url-base-vs-path-separation` pattern in the KG.** New entity (type `pattern`) with 6 observations covering: anatomy rule, diagnostic heuristic on 4xx/5xx (BASE vs PATH vs gateway re-import), Apigee `info.version` co-symptom, authoring rules, reviewer severity guidance, and common confusion patterns observed in agent flows. Exported to `shared-knowledge/url-base-vs-path-pattern-2026-05-10.json` (1 entity, 6 observations) so other developers can import via `chromadb-mcp/import.py`. Origin: a recurring agent failure mode where 400-OASValidation incidents at the Apigee gateway were "fixed" by patching URLs in client code, which masked the real problem (missing `info.version` bump) and broke contracts on the next re-import.

### Fixed (orchestrator dispatch hardening — second pass)

- **Authoritative tool list + mandatory boot line at the top of `agents/orchestrator.md`.** The first dispatch-hardening pass (commit `c4f659f`) added a prose `Dispatch invariants` block telling the orchestrator that any "Task is unavailable" conclusion was wrong. It still hallucinated the same failure (`/gcp-costs` and a one-shot Excel ingest both froze with "no Task tool in my environment"). Root cause: the agent doesn't *inspect* its tools before acting — it reasons abstractly about Task from the system prompt. Fix: a new section **"Available tools in this invocation (authoritative)"** placed right after the role statement and before the existing invariants, that (1) enumerates the exact tools the harness injects (`Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit`), declaring this list the single source of truth and shutting down all other forms of tool-availability reasoning, and (2) requires the orchestrator's very first output line to be a fixed boot string — `[orchestrator boot] tools confirmed: ...` — that anchors the tools list as observed fact instead of abstract claim. The redundancy with frontmatter is the point: the list lives in the prompt body, where the model reads it as content rather than metadata. The original `Dispatch invariants` block stays in place — the new section augments it with a concrete acknowledgment ritual rather than replacing it.

### Fixed (orchestrator dispatch hardening — first pass)

- **Orchestrator no longer falsely claims "no Task tool available".** Added a `Dispatch invariants` block at the top of `agents/orchestrator.md` (right after the role statement, before "Your Team"). Four runtime invariants the agent must treat as facts: (1) `Task` is always present (frontmatter-declared, harness-injected) — any conclusion that it isn't is wrong by definition; (2) the orchestrator is forbidden from substituting itself for a subagent (no "degraded mode" writing `01-architecture.md`, `02-implementation.md`, etc. by hand, even if the user authorises it); (3) on a real Task failure, retry once and report the **literal harness error** instead of paraphrasing; (4) user instructions like "no implementes todavía" / "muéstrame el plan primero" mean *run Design + Plan-Ratification then pause*, **not** *skip the architect*. Closes the failure mode where the orchestrator wrote a correct `00-task-intake.md`, then froze at Phase 1 claiming it could not dispatch the architect, and asked the user to choose between "retry / degraded research / reduced scope". The bug was a hallucinated tool-availability check; the fix is an explicit, non-negotiable invariant the agent reads before each phase transition.

### Added (verification suite for harness changes)

- **`tests/` folder.** First test suite for the repo. Covers the two surfaces that are testable without a live LLM: `hooks/policy-block.sh` (functional) and the structural integrity of the agent / skill / hook `.md` / `.json` files (cross-references, mandatory sections, frontmatter fields).
  - `tests/test_policy_block.sh` — ~48 cases over `rm` destructive vs safe (`/`, `~`, `$HOME`, `--`, wildcard), `git` destructive vs safe (`--force`, `--no-verify`, `reset --hard`, `clean -f`), SQL `DROP`/`TRUNCATE`, sensitive paths (`.env`, `.pem`, `.ssh/`, `.aws/credentials`, `secrets.*`), allow-list variants (`.env.example`/`.sample`/`.template`), malformed payloads (fail-open).
  - `tests/test_agent_structure.py` — ~98 assertions across 11 suites: tool allowlists per agent, the 5-column Roster matrix, new pipeline phases (1.5 / 2.5 / 3.5 / 3.6 / 4.5), the `tester` / `qa` / `reviewer` / `implementer` / `delivery` contracts, the `PreToolUse` wiring across windows/macos/linux, README cross-references.
  - `tests/run-all.sh` — wrapper, exit 0 iff all suites pass.
  - CLAUDE.md § 4 Golden Commands and § 9 Testing Conventions updated with how to run and what's covered.

### Fixed

- **`hooks/policy-block.sh` regex now matches `rm -rf -- /` and `rm -rf -- ~`.** The previous patterns required the destructive target to follow `rm -rf` directly; users who write `rm -rf -- /` (POSIX option terminator) bypassed the gate. Patterns updated to allow an optional `-- ` between the flags and the target. Caught by the new functional tests.

### Added (harness hardening — capability scoping, tracing, gates)

- **Tool allowlist per agent (capability scoping).** Every agent's frontmatter now declares a `tools:` allowlist, the runtime restricts the agent to that set. Read-only auditors (`architect`, `security`, `qa`, `acceptance-checker`) lose `Bash` entirely so they cannot mutate the host even by accident. Builders keep `Bash` but the harness gates destructive commands at `PreToolUse` (next entry). `agents/README.md` Roster table is now a 5-column matrix (Model + Effort + Tools + Role); a new "Earn the tools" principle joins "Earn the model and effort". Implements Anthropic's *"permission surface = agency boundary"*.
- **PreToolUse policy gate (`hooks/policy-block.sh`).** Cross-platform bash + python3 hook that reads tool call JSON from stdin and emits a hook decision. Hard runtime guardrail backing the prompt-level `NEVER` rules in agent definitions. Blocks: `rm -rf` targeting `/`, `~`, `$HOME`, or bare wildcard; `git push --force` / `-f` / `--force-with-lease`; `git reset --hard`; `git clean -f`; `--no-verify` on commit/rebase/push; `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE TABLE` via shell; writes to `.env` (any non-`.example`/`.sample`/`.template` variant), `*.pem`, `id_rsa*`/`id_ed25519*`/`id_ecdsa*`/`id_dsa*`, anything under `.ssh/`, `.aws/credentials`, `.aws/config`, `credentials.json`, `secrets.{yaml,yml,json,toml}`. Wired into `hooks/config.json` for windows/macos/linux. Documented in `hooks/README.md` § "Policy gate" with what it does, what it doesn't (it is not a sandbox), and how to scope an exception.
- **JSONL execution events trace (`00-execution-events.jsonl`).** Append-only, machine-readable log emitted by the orchestrator from each agent's status block. Schema: `pipeline.start/end`, `phase.start/end`, `gate.pass/fail` (Phase 1.5/3.5/3.6), `iteration.start`, `policy.deny`, `compaction.trigger` events, with fields `ts`, `event`, `feature`, `phase`, `agent`, `status`, `duration_ms`, `tokens_in`, `tokens_out`, `verdict`, `iteration`, `summary`, `extra`. Complements the existing markdown `00-execution-log.md` (human-readable) and `pipeline-metrics.json` (end-of-run aggregate). jq-friendly; survives compaction since it lives on disk. Implements Anthropic's *"wire tracing in on day one"*. Token fields enable cost tracking without SDK introspection — the orchestrator approximates from input/output sizes using the same heuristic as `tokens_estimated`.

### Added (pipeline gates and reconciliation)

- **Test-ratchet gate at Phase 3.5.** Tester's status block now reports `tests_count`, `tests_deleted`, and `tests_deleted_reason`. The orchestrator captures the baseline on the first iteration and compares on each subsequent iteration. Deletions with no reason or with forbidden patterns ("broken", "flaky", "couldn't make them pass") fail the gate and route back to `tester` with: "Restore the deleted tests and fix the underlying issue instead." Counts toward the max-3 iteration budget. Prevents the ICLR 2024 *"early victory problem"* where evaluators delete tests across iterations to make the suite green. Outcome recorded in `00-execution-events.jsonl` (`gate.pass` / `gate.fail` with `extra.tests_before` / `.tests_after` / `.tests_deleted`).
- **Phase 2.5 — Constraint Reconciliation (formalised).** The previous informal "orchestrator reconciles inline" behaviour for `[CONSTRAINT-DISCOVERED]` annotations now distinguishes trivial from non-trivial constraints. Trivial (cosmetic, semantic equivalents) keep the fast path. Non-trivial (changes to user-visible contract, behavioural promises, batch sizes that affect latency, or any constraint on a complex task) invoke `qa` in a new `reconcile` mode. `qa` decides per AC: keep / amend / drop, without rewriting AC itself. If 1+ AC drops, the orchestrator stops and confirms with the user before continuing — the mid-task requirement-change failure mode Cognition reported as dominant for Devin. New `qa` operating mode added to `agents/qa.md` parallel to `ratify-plan` and `define-ac`; output appends to `04-validation.md` under `## Reconciliation Decisions (Phase 2.5)`.
- **Phase 4.5 — Internal Review (advisory).** After Phase 4 (Delivery) and before Phase 5 (GitHub Update), the orchestrator invokes `reviewer` in a new `internal` mode that reviews the freshly-pushed diff locally and surfaces the top 3 highest-severity issues to the user. Does NOT publish to GitHub — verdict is advisory and never blocks delivery. Gated by diff size: skipped on diffs ≤50 lines AND ≤2 files, on hotfix single-file fixes; runs on complex / >50 lines / >2 files / security-sensitive. Cuts review-fatigue without replacing the human review (Cognition: *"the bottleneck shifted from writing code to reviewing it"*). New `reviewer` operating mode added alongside `fresh` / `update-body` / `reply`.

### Added (completion criteria, compaction, dispatch)

- **`done.yml` formal completion criteria.** Single, evaluable YAML file written by the orchestrator at three points (Phase 0b initial, Phase 3 fills tests/qa/security, Phase 3.5 fills AC counts and ratchet) and read by `delivery` at the top of Phase 4. Schema: `ac_count`, `ac_passed`, `tests_passing`, `tests_count`, `qa_verdict`, `security_findings_critical/high`, `all_ac_have_tests`, `test_ratchet_passed`, `acceptance_check_verdict`, `done` (computed), `done_reasons[]`. `delivery` aborts with `status: blocked` if `done == false`. Why not redundant with Phase 3.5: 3.5 is the runtime gate (does the pipeline progress?); `done.yml` is the durable record (audit, tooling, separate auditor). Both must agree — if 3.5 says proceed but `done.yml` evaluates to false, abort and surface the bug. Implements Anthropic's *"define completion criteria in external, testable files"*.
- **Mid-pipeline compaction trigger.** Phase 6's existing handoff prompt covers the inter-feature boundary; this adds the intra-feature boundary. When the cumulative orchestrator context (estimated cheaply from JSONL `tokens_in/out` + 5K overhead) exceeds ~40% of the effective window, the orchestrator expands `00-state.md` with a `## Rebuild Hints` section (current phase, iteration, hot context, session-doc pointers, exact next action) and prompts the user with `/compact` vs `/clear` options between phases — never mid-phase, never auto-deciding. Anti-spam: fires at most once per phase boundary; no re-prompt unless the budget grows by another 15 percentage points. Logged in `00-execution-events.jsonl` as `compaction.trigger`. Anchored to harness-design's finding that long-context scenarios collapse agent success past 40-50%.
- **`/background` skill for fire-and-forget dispatch.** New standalone skill (no orchestrator routing) for trivially scoped, fast-path tasks: typo fixes, version bumps, dependency upgrades, missing `loading.tsx`, copy changes. Eligibility gate (Phase 1) rejects anything that needs verification, has security surface, touches secrets/auth, requires tests to confirm, or has implicit AC. Phase 2 builds a single `claude -p ... --output-format stream-json --permission-mode acceptEdits --allowedTools "..." > /tmp/log 2>&1 &` command the user pastes into a new terminal or tmux pane. The skill does NOT run the command — the user owns the actual fire. The dispatched session inherits `~/.claude/` config including `policy-block.sh` PreToolUse hook, so destructive commands stay blocked even in the background. For multiple parallel tasks, `/tmux` remains the right tool.

### Added (Reviewability Contract — implementer + delivery + reviewer)

- **Reviewability Contract in `agents/implementer.md`.** Adds a new Non-Negotiable bullet alongside SOLID / Clean Code / DRY: functions ≤ 40 lines, ≤ 4 parameters, nesting depth ≤ 3; **golden-path structure** (validation/early returns up top, happy path linear, errors at the bottom); **one concern per commit** (no mixing refactor + feature, no mixing reformatting + functional change); comments only when the WHY is non-obvious (no comments that restate WHAT); test names describe behaviour (`returns_400_when_token_is_expired`, not `test_auth_1`). Phase 3 self-review gains a Reviewability sub-checklist mirroring the caps. The `02-implementation.md` template gains a `## Reviewability Exceptions` block: when a function legitimately needs to exceed a cap (long state machine, config builder where extraction would obscure intent), the reason is documented inline so the reviewer doesn't have to guess. Gate is "explained or under cap", not "under cap or hidden". Source: Cognition Devin 2025 review, ICLR 2024 cognitive-load research.
- **Reviewability size gate in `agents/delivery.md` (new Step 9d).** Before staging files, delivery checks the diff against the human-reviewer caps: `≤ 400 lines AND ≤ 8 files` passes silently; `400-1000 lines` or `8-20 files` requires a justification in `02-implementation.md` `## Reviewability Exceptions` (embedded in the PR body under `## Size justification`); `> 1000 lines` or `> 20 files` always aborts with a suggested split strategy (refactor first, feature second, each as its own PR).
- **Structured PR body in `agents/delivery.md` (Step 11.2 / 11.3).** Replaces the previous free-form template (Summary / Changes / Tests / Acceptance Matrix / DoD / Version) with a sectioned template optimised for the reviewer's mental model: **Main change** in the user's voice, **File map** grouped by intent, **How to review** with suggested reading order, **Risk and blast radius** with rollback plan, **Before / after** when behaviour visibly changes, **Acceptance Matrix** + **Definition of Done** + **Version** kept from the previous template, plus conditional sections for **Pre-PR Review** (paste from `04-internal-review.md` if Phase 4.5 ran) and **Size justification** (when Step 9d flagged the diff). Conditional sections are omitted entirely when not applicable — no empty headings. Devin reported this kind of restructuring as the difference between 34% and 67% merge rate.
- **Reviewability score block in `agents/reviewer.md`.** First thing the reviewer computes; goes at the top of `review_body` (in Spanish) before "Evaluación del Objetivo". Score tiers: **alta** (≤ 200 lines AND ≤ 4 files AND 0 functions over caps AND no refactor+feature mixing — 5-10 min review), **media** (200-400 lines OR 4-8 files OR 1-2 functions over caps OR minor mixing — 15-30 min), **baja** (> 400 lines OR > 8 files OR 3+ functions over caps OR significant mixing — 30-90 min, with an explicit "split before reviewing" recommendation). Score is informational — does NOT change `event` (APPROVE / REQUEST_CHANGES); a clean diff with low reviewability still merges, a tiny diff with one critical still gets REQUEST_CHANGES. Caps mirror the implementer's contract.

### Fixed (documentation drift)

- **Top-level `README.md`**: corrected counts ("18 agents, 30 skills" → "16 agents, 27 skills (3 of which are complex multi-file)"), added missing `acceptance-checker` row, broke out `gcp-cost-analyzer` into its own row instead of a generic "plus" footer, and updated the pipeline diagram to reflect Phase 1.5 (Plan Ratification), 3.5 (Acceptance Gate) and 3.6 (Acceptance Check).
- **`shared-knowledge/README.md`**: removed stale "to be built — see roadmap" caveat from the export/import flow; the tools live in `chromadb-mcp/` and are referenced consistently.
- **`hooks/README.md`**: removed leftover "binds three events" sentence — the default set is two events (Notification + PostToolUseFailure) since `Stop` was removed from the default.

### Added

- **Auto-verification gates before delivery.** The pipeline now has two redundant acceptance gates that prevent shipping when AC are not fully covered:
  - `agents/orchestrator.md` new **Phase 3.5 — Acceptance Gate**: between Verify and Delivery, the orchestrator re-reads `00-task-intake.md`, `03-testing.md`, `04-validation.md`, `04-security.md` and confirms every AC has both a passing test (in tester's AC Coverage) and a `PASS` (in qa's validation). On mismatch, routes back to implementer (still bounded by max 3 iterations) or aborts with `status: blocked` if AC counts diverge between docs.
  - `agents/delivery.md` new **Step 0 — Acceptance Gate**: re-verifies the same artifacts before any branch / commit. Aborts with `status: failed` if any AC is missing PASS, missing a test, or if security has unresolved Critical / High findings.
- **Definition of Done in delivery.** New `agents/delivery.md` Step 9b runs the project's quality gates (lint, typecheck, tests, build — discovered from CLAUDE.md or the project manifest) before staging files. Any failure aborts delivery.
- **Acceptance traceability matrix.** New `agents/delivery.md` Step 9c writes `session-docs/{feature-name}/acceptance-matrix.md` with one row per AC mapping to test (file:line), QA evidence (file:line) and security status. The matrix is embedded in the PR body (Step 11.2 / 11.3) so reviewers see acceptance coverage at a glance.

### Added (Anthropic harness-design principles applied)

- **Phase 1.5 — Plan Ratification (cheap loop guard).** New phase in `agents/orchestrator.md` between Design and Implementation. Invokes `qa` in new `ratify-plan` mode (added to `agents/qa.md`) with the AC list and the architect's Work Plan. The qa agent only checks coverage (does every AC map to at least one Work Plan step?), not code. If any AC is uncovered, routes back to architect before any code is written. Cost: ~3-5K tokens. Saves: an entire implementer + tester + qa + security iteration when the Work Plan was incomplete (~20-50K tokens). Skipped on `complexity: standard` with <4 AC. This is the "sprint contract" pattern from Anthropic's harness-design article.
- **Final-state handoff at end of Phase 6.** The orchestrator now writes a `## Final state — ready for handoff` block to `00-state.md` after KG save and surfaces a prompt instructing the user to run `/compact` or `/clear` before the next feature. Implements Anthropic's "context resets over compaction" pattern explicitly at feature boundaries. Without this, sessions running 3-4 features back-to-back accumulate 50-100K tokens of stale context.
- **Pipeline metrics expanded.** `pipeline-metrics.json` now includes per-phase `tokens_estimated`, `iterations.root_causes` with case classification (A/B/C/D), and `estimation_accuracy` (estimated vs actual minutes for planning-mode tasks). New phases (`ratify_plan`, `acceptance_gate`, `acceptance_check`) are tracked with their verdicts. Powers the "progressive harness simplification" workflow: lets you see, over time, which gates catch real bugs and which produce false alarms.

### Changed (cost-effectiveness gating)

- **Phase 3.6 (acceptance-checker) is now conditional.** Runs only when `complexity: complex`, when >3 files were touched across modules, when any verify iteration occurred, or when the user passes `--audit` explicitly. On simple changes (`complexity: standard`, ≤3 files, 0 iterations) it is skipped with a one-line log. Implements Anthropic's "evaluator is worth the cost only when the task sits beyond what the model does reliably solo" — for trivial fixes the existing Phase 3 + 3.5 gates are sufficient.
- **Agent-time sizing recalibrated for Opus 4.7 / Sonnet 4.6.** `agents/architect.md` (planning mode) tightens the XS/S/M/L bands (XS: 10-20 → 5-15 min, S: 20-45 → 15-30, M: 45-90 → 30-60, L: 90-180 → 60-150). Adds anti-sandbagging rules — explicit "default to LOW end", "do NOT add safety margins", "do NOT estimate as if you were a human team" — and named multipliers (×1.3 for new stack, ×1.5 for risky migration, ×2.0 for spike) that DO NOT stack. The pipeline-metrics `estimation_accuracy` field surfaces persistent over-estimation so the architect can self-correct over time.

### Changed (review-pr context hygiene)

- **`/review-pr` now reminds the user to run `/compact` after each review.** Each invocation accumulates 5-30K tokens in the main context (PR data, full diff, file lists from `gh` / `git` outputs, status blocks). Subagents die between PRs but the main context does not — successive reviews in the same session compound linearly. `skills/review-pr.md` Step 15 now includes a mandatory reminder block in the final response with an estimated token weight per review and an explicit `/compact` instruction. This is the cheapest way to keep multi-PR review sessions from bloating: zero infra, just discipline.

### Added (acceptance auditor)

- **New `acceptance-checker` agent (sonnet@medium).** Independent reviewer invoked between Phase 3.5 (orchestrator's acceptance gate) and Phase 4 (Delivery). Compares the **original spec** (the "Original Description" block written verbatim at intake) against the actually delivered artifacts (`02-implementation.md`, `03-testing.md`, `04-validation.md`, `04-security.md`). Catches three failure modes the existing gates can miss: (1) silent scope reduction (AC was rewritten to match what could be implemented, not what was asked), (2) implementation drift (code does what AC says but not what the user described in plain language), (3) coverage gaps in implicit non-functional requirements (perf, a11y, security). Returns a non-binding `verdict` (`pass` / `concerns` / `fail`) on its status block; the orchestrator decides whether to ship, iterate, or surface concerns to the user. Output: `session-docs/{feature-name}/06-acceptance-check.md`.
- **Phase 3.6 — Acceptance Check** added to `agents/orchestrator.md`. Runs once per pipeline (not per iteration), only after Phase 3.5 passes. The new agent is added to the team table, the roster in `agents/README.md`, and the canonical matrix enforced by `/lint` Check 7.

### Changed

- **Iteration routing now reads only `failure-brief.md`.** When Phase 3 verify fails, the orchestrator no longer re-reads `03-testing.md`, `04-validation.md`, or `04-security.md` in full (5-15K tokens each). Instead, `tester` / `qa` / `security` append a compact iteration entry to `session-docs/{feature-name}/failure-brief.md` as part of their Return Protocol when they fail. The orchestrator reads ONLY the brief to decide routing (Case A / B / C / D). Full session-docs remain available for debugging when the brief is unclear, but happy-path iteration touches only the brief.
- **Batch worktrees emit one-line events instead of copying `00-state.md`.** The Stop hook now writes `{task}|{status}|{summary}` (≤300 bytes) and PostToolUse writes `{task}|{phase}` (~50 bytes) to `/tmp/batch-results/`. Previously each event copied the entire `00-state.md` (5-15K tokens). The parent orchestrator's context now scales linearly at ~300 bytes per task instead of multiple kilobytes; if it needs more detail it opens the worktree's `00-state.md` on demand.

### Fixed

- **Phase 6 token-cost anti-pattern removed.** `agents/orchestrator.md` no longer calls `read_graph` from the Knowledge Save phase. The previous "Auto-consolidate check" loaded the entire knowledge graph (often 100K+ tokens) on every pipeline just to count entities — token cost scaled linearly with KG size. Dedup now relies exclusively on the targeted `search_nodes` call already done in step 2 (vector search, top-N, cheap regardless of graph size). Periodic whole-graph consolidation is surfaced to the user via `/memory consolidate` instead of running automatically.

### Added (earlier in this cycle)

- **Stack guardrails distilled from the knowledge graph.** Recurring pitfalls observed across past pipelines are now codified into the agent prompts so they are caught at design / implementation time, not at runtime:
  - `agents/implementer.md` Phase 0: NestJS + OpenTelemetry guardrail (SDK before `NestFactory.create()`, align the `@opentelemetry/*` family on upgrades, smoke-test runtime after major bumps, `Resource` removal in `@opentelemetry/resources` v2.x).
  - `agents/implementer.md` Phase 2 Frontend: Next.js + shadcn/ui + React guardrails (shadcn v3 vs v4 `asChild` → `render`, Next.js 16 `middleware.ts` deprecation, auto-fetching hook initial state, `next/dynamic({ ssr: false })` skeleton sizing, App Router `loading.tsx` per detail segment, Zustand selector reactivity).
  - `agents/tester.md` new "Common Testing Pitfalls (NestJS / Node)" section: TypeORM entity coverage cap, `setImmediate` mocking pattern, `error?.message || String(error)` branch coverage, env vars before `require()` in Koa/Express controller mocks, fake timers for `moment.utc()` and date-range boundary tests.
  - `agents/architect.md` new "Domain Heuristics" subsection: PostgreSQL high-volume time-series partitioning rules (no `synchronize: true`, partition key in every unique constraint, summary tables for full-history aggregations, TypeORM decimal transformer) and multi-currency / multi-country financial aggregation contract.
  - `agents/delivery.md` new Step 8c: API gateway re-sync notice for services behind Apigee / Kong / AWS API Gateway.

### Changed

- **Knowledge graph write policy hardened.** `agents/orchestrator.md` Phase 6 (Knowledge Save), `skills/memory.md` (consolidate / create paths), and `docs/kg-content-policy.md` now spell out concrete redaction rules with examples drawn from real past violations: no absolute paths with a user identifier (`C:/Users/<name>/...`), no PR / issue numbers, no developer names, `[project]` entities must be named after the bare repo. Each agent that can write to the KG runs a short pre-write checklist before calling `create_entities` / `add_observations`.
- **Earn the model AND the effort.** Reassigned the 15 agents along two dials: `model` (opus for analysis/coordination, sonnet for execution-against-plan) and `effort` (`max` for irreversible analysis, `high` for solid analytical work, `medium` as floor for everything else — `low` is forbidden by policy). Seven agents move to `sonnet` (`implementer`, `tester`, `delivery`, `diagrammer`, `d2-diagrammer`, `likec4-diagrammer`, `translator`); the other eight stay on `opus` with explicit effort levels. The canonical matrix lives in `agents/README.md` and is enforced by a new `/lint` check (Check 7).
- **`/lint` Check 7 added.** Validates that every agent's `model` + `effort` frontmatter matches the canonical matrix in `agents/README.md`, fails on `effort: low`, and warns on unknown agents.
- **`agent-builder.md` "Earn the model" section** rewritten to cover both `model` and `effort` dials and reference the canonical matrix.
- **Notifications default is now quiet.** Removed the `Stop` event from `hooks/config.json` (it fires on every Claude response and creates notification fatigue during active work). The default set is now `Notification` (idle / permission prompts) + `PostToolUseFailure` only. Developers who want a ping when long runs finish can opt in by following the "Opt-in: notify when Claude finishes a turn" section in `hooks/README.md`.

### Added

- **MIT License** (`LICENSE`) — repo is now under MIT, copyright 2026 Mario Gutierrez. `README.md` updated accordingly.
- Contributor README in each top-level system folder: `agents/`, `hooks/`, `skills/`, `chromadb-mcp/`. Each describes the file conventions, how to add or modify artifacts, and routing / runtime details. These READMEs are **not** copied into `~/.claude/` — the installer skips them.
- `chromadb-mcp/README.md` is now the **canonical reference** for every KG operation (view, edit, share, run the server, migrate), replacing scattered docs. Top-level `README.md` points to it.

### Changed

- `bin/install.py` now skips `README.md` files when copying, so contributor docs can live alongside the artifacts without polluting a developer's `~/.claude/`.

## [0.2.0] — 2026-04-22

### Added

- **Manifest-based safe updates.** The installer now writes `~/.claude/.claude-dev-team-manifest.json` tracking which files it installed and their hashes. On re-run, files whose current hash matches the manifest are safely overwritten with the new version (this is a clean update). Files modified locally are still reported as conflicts and left untouched. Adds an `updated` counter to the summary.
- **UTF-8 stdout** forced in `bin/install.py` so Unicode characters (em-dashes, etc.) render correctly in Windows terminals.

### Changed

- **Repo structure simplified.** Moved `hooks-config.json` → `hooks/config.json` (cohesion: all hooks material in one place). Removed `diagram.excalidraw` / `diagram_preview.png` (outdated visuals, will be redone in a future release). Removed `settings.json` from the repo (was personal to the original maintainer).
- **`README.md` rewritten** with installation instructions at the top, target OS and dependency requirements, and a tight overview of what the system ships. English throughout.
- **`docs/kg-content-policy.md` translated to English** to match the system-wide documentation convention.
- **`agents/README` removed** — redundant with `README.md` and out of date.

### Removed

- `settings.json` (personal) — also purged from git history.
- `diagram.excalidraw` and `diagram_preview.png` (obsolete).
- `agents/README` (redundant).

## [0.1.0] — 2026-04-22

Initial release of the `claude-dev-team` agent system distribution.

### Added

- **Installer.** Cross-platform Python installer at `bin/install.py` (PEP 723 inline metadata, zero third-party deps) with bootstrap scripts `bin/install.sh` (Unix / macOS) and `bin/install.ps1` (Windows). Copies agents, skills, hooks, and the ChromaDB MCP server into `~/.claude/`. Non-destructive: existing files with different hashes are reported as conflicts and never overwritten.
- **MCP registration.** Installer surgically merges `mcpServers.memory` and `mcpServers.context7` into `~/.claude.json` with a timestamped backup (`~/.claude.json.bak-YYYYMMDD-HHMMSS`). Prompts for `CONTEXT7_API_KEY` interactively or reads it from the environment.
- **Knowledge-graph MCP server** (`chromadb-mcp/`): stdio FastMCP server, optional SSE runner (`manage-server.sh`), web viewer (`viewer/app.py`), legacy migration tool (`migrate_knowledge.py`).
- **KG sharing.** `chromadb-mcp/export.py` dumps the local KG to JSON; `chromadb-mcp/import.py` merges a JSON into the local KG non-destructively (dedup observations, idempotent relations).
- **`shared-knowledge/` folder** as the agreed drop-off location for KG exports, with a README describing the workflow.
- **KG content policy** (`docs/kg-content-policy.md`) — technical memory only; no personal data, credentials, client/stakeholder info, or volatile references.
- **Policy filter in `orchestrator.md`** Phase 6 (Knowledge Save) enforcing the policy on every `create_entities` / `add_observations` call.
- **macOS notification hook** (`hooks/notify-mac.sh`) for parity with existing Linux and Windows hooks. `hooks-config.json` gained a `macos` section.

### Required dependencies

- `uv` — Python toolchain manager (runs installer and MCP server).
- `gh` — GitHub CLI (used by several skills).
- **context7 API key** — for library docs retrieval.

[Unreleased]: https://github.com/valianx/team-harness/compare/v2.15.1...HEAD
[2.15.1]: https://github.com/valianx/team-harness/compare/v2.15.0...v2.15.1
[2.15.0]: https://github.com/valianx/team-harness/compare/v2.14.0...v2.15.0
[2.14.0]: https://github.com/valianx/team-harness/compare/v2.13.1...v2.14.0
[2.13.1]: https://github.com/valianx/team-harness/compare/v2.13.0...v2.13.1
[2.13.0]: https://github.com/valianx/team-harness/compare/v2.12.1...v2.13.0
[2.12.1]: https://github.com/valianx/team-harness/compare/v2.12.0...v2.12.1
[2.12.0]: https://github.com/valianx/team-harness/compare/v2.11.1...v2.12.0
[2.11.1]: https://github.com/valianx/team-harness/compare/v2.11.0...v2.11.1
[2.11.0]: https://github.com/valianx/team-harness/compare/v2.10.2...v2.11.0
[2.10.2]: https://github.com/valianx/team-harness/compare/v2.10.1...v2.10.2
[2.10.1]: https://github.com/valianx/team-harness/compare/v2.10.0...v2.10.1
[2.10.0]: https://github.com/valianx/team-harness/compare/v2.9.4...v2.10.0
[2.9.4]: https://github.com/valianx/team-harness/compare/v2.9.3...v2.9.4
[2.9.3]: https://github.com/valianx/team-harness/compare/v2.9.2...v2.9.3
[2.9.2]: https://github.com/valianx/team-harness/compare/v2.9.1...v2.9.2
[2.9.1]: https://github.com/valianx/team-harness/compare/v2.9.0...v2.9.1
[2.9.0]: https://github.com/valianx/team-harness/compare/v2.8.0...v2.9.0
[2.8.0]: https://github.com/valianx/team-harness/compare/v2.7.0...v2.8.0
[2.7.0]: https://github.com/valianx/team-harness/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/valianx/team-harness/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/valianx/team-harness/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/valianx/team-harness/compare/v2.4.1...v2.5.0
[2.4.1]: https://github.com/valianx/team-harness/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/valianx/team-harness/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/valianx/team-harness/compare/v2.2.0...v2.3.0
