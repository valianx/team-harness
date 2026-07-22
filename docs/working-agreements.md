# Working Agreements — Post-work Deliverables

> Offloaded from `CLAUDE.md § 6.3` to keep CLAUDE.md within its §7b size budget. This file is the
> canonical text; `CLAUDE.md § 6.3` is a condensed pointer here. The rules below are the floor for
> any user-facing change, whether it ships through the orchestrated pipeline or as a manual commit.

## Post-work (deliverables for any user-facing change)

- Write a CHANGELOG fragment to `changelog.d/{pr-slug}.md` (preferred) rather than editing
  `## [Unreleased]` inline. Each PR writes one file; no two PRs in the same session can conflict.
  The delivery agent assembles all fragments into the versioned CHANGELOG section at release cut
  (Step 9e). Fragment format: a standard Keep-a-Changelog subsection block (`### Added`,
  `### Changed`, `### Fixed`, `### Security`) with one-line entries. Slug rule: lowercase branch
  name with non-alphanumeric characters replaced by hyphens, matching `[a-z0-9-]+`. Direct
  `## [Unreleased]` edits are acceptable as a fallback when `changelog.d/` cannot be used (e.g.,
  pre-convention repos).
- If §3 Tech Stack or §4 Golden Commands of CLAUDE.md changed, update those sections in the same
  PR — do not let CLAUDE.md drift from the repo.
- If the change establishes a decision, pattern, or constraint that future work must respect,
  append a one-line bullet to `docs/knowledge.md` with the matching tag prefix (`[decision]`,
  `[pattern]`, `[stack]`, `[constraint]`).
- If the repo has an OpenAPI spec (`openapi/openapi.yaml` or similar) and the change touches
  endpoints, bump `info.version` in the same commit as the spec change — never in a separate
  commit.
- **Internal distribution rule of the team-harness repository** — matches the shipped pipeline
  default (`delivery`/`orchestrator` bump the project version once per PR; see
  `agents/delivery.md § Step 9`). Changes touching distributed plugin assets bump all three
  version sites in the same PR and write the `## [X.Y.Z]` CHANGELOG section directly.
  **Trade-off:** concurrent PRs touching distributed assets race on the version line
  (rebase-and-rebump). `changelog.d/{pr-slug}.md` remains the batch/fallback path for grouped
  sessions, not team-harness's own default. Full site list:
  `docs/cost-and-caching.md § "team-harness's own version sites"`.
- **New hooks must be authored in TypeScript, not Bash** (Decision A = closed). See
  `docs/opencode-distribution-roadmap.md` § Cross-Harness Authoring Mandate.
