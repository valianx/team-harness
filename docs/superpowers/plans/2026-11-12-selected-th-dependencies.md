# Selected TH Dependency Maintenance Implementation Plan

**Goal:** Install/update only dependencies selected by an operator using TH in consuming projects.
**Architecture:** A shared skill reference defines discovery, official lifecycle and independent receipts. Native updater/convergence mechanisms stay unchanged.
**Spec:** `openspec/specs/selected-dependency-maintenance/spec.md`
**Tech Stack:** Markdown skills and existing JavaScript projection generators.

## Constraints and review focus
Preserve explicit pins, unrelated global installations, consumer manifests, host permissions and independent partial progress. An on-demand cache is not a global install; PATH alone is not selection. No live updates during development.

## Tasks
- [x] Author shared maintenance contract and living requirements.
- [x] Wire native Claude/Codex/OpenCode/Pi update routes and project/provider ownership.
- [x] Generate runtime projections and verify generation.
- [x] Review operator scenarios: absent selected CLI, unrelated PATH executable, pinned version, shared-owner conflict, isolated failure.
- [x] Run existing full suite, record unavailable coverage, inspect final diff.

Prose is reviewed, not tested by sentence assertions, per repository testing rules.
Publication and installation are outside this local implementation task.

Validation: generator checks and review passed. Full suite had one missing-esbuild setup failure; after restoring lock-identical local dependencies, build and the 20-case retained hook suite passed. No live consumer installation was run.

Final rerun: `GOFLAGS=-buildvcs=false bash tests/run-all.sh` completed with all suites passed (exit 0).
