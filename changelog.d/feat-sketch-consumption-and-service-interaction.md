### Added
- New `spans_multiple_services` boolean (8th classification boolean) — triggers `01-sketch-service-interaction.md` (Mermaid `sequenceDiagram`, changed call paths only) when a task wires service-to-service call flows
- `01-sketch-service-interaction.md` skeleton template in `agents/architect.md` Phase 2
- Multi-project consolidated `sketches/` layout: per-project conditional sketches use `{project}-` prefix at `{overview_root}/sketches/`; shared `service-interaction.md` lives un-prefixed at the same root
- Sketch required-reading consumption contract: `implementer`, `tester`, and `qa` must read triggered sketch files before doing their work and emit `sketches_read` in their status blocks; `acceptance-checker` Phase 3.6 now reads sketches explicitly and includes a service-interaction diff row; `reviewer` reads sketches when a workspace exists; `review-pr` and `validate` skills note sketch reading after the prerequisite probe

### Changed
- `hooks/sketch-guard.sh` Step 3: absent classification block now runs an anti-gaming scan — if `01-plan.md` Files: contain contract-surface keywords (route/controller/handler/endpoint/openapi/schema/migration/model/component), emits `verdict:concerns` with a concern naming the skipped classification instead of silently passing (fail-OPEN preserved; never `verdict:fail`)
- `hooks/sketch-guard.sh` Step 5b (new): consolidated `sketches/` path resolution — detects multi-project workspace via parent `overview.md`; resolves required-sketch paths to consolidated layout; absent `overview.md` falls back to flat single-project path (current behavior unchanged)
- `agents/architect.md` Phase 2 Step 1: explicit multi-project clause — per-project architect lane must write the classification block in THAT project's `00-state.md`; all-false block still required (presence = classification happened)
- `agents/orchestrator.md` Parallel Multi-Project Dispatch: classification block named as a required per-project Stage-1 deliverable; all-false block on self-authored plans; Rule 11 surfacing per-project
- `agents/plan-reviewer.md` Rule 11: per-project run wording; missing-block-on-HTTP-files concern; `spans_multiple_services` added to SKETCH_MAP
- `docs/plan-sketches.md`: §2 8th boolean, §3 service-interaction row, §4 multi-project consolidated layout subsection, §6 strengthened consumption lifecycle rows
