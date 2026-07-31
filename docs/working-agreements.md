# Working Agreements — Post-work Deliverables

> Offloaded from `CLAUDE.md § 6.3` to keep CLAUDE.md within its §7b size budget. This file is the
> canonical text; `CLAUDE.md § 6.3` is a condensed pointer here. The rules below are the floor for
> any user-facing change, whether it ships through the orchestrated pipeline or as a manual commit.

## Post-work (deliverables for any user-facing change)

- For the shipped default, Delivery writes `changelog.d/{pr-slug}.md` and the coordinator
  assembles it into the versioned CHANGELOG section in the **same PR**. Leaving fragments for a
  later release cut is allowed only when the repository explicitly declares `skip-version` or a
  grouped batch/fallback flow. Fragment format: a standard Keep-a-Changelog subsection block (`### Added`,
  `### Changed`, `### Fixed`, `### Deprecated`, `### Removed`, `### Security`) with one
  operator-visible outcome per bullet. The final emitted bullet, including any `Fixes #{issue}`
  suffix, is capped at 140 characters; reserve suffix space and rewrite rather than truncate.
  A small one-outcome change gets exactly one bullet; every bullet is one sentence on one
  physical Markdown line, with no continuation or explanatory paragraph.
  Never enumerate services, files, tasks, tests, or implementation layers when they jointly
  produce one outcome. Release sections contain only standard subsection headings and bullets:
  no free-standing notes, context, summaries, HTML comments, blockquotes, footnotes, or
  postscripts. Assembly copies entry text verbatim and never expands it. Derive `{pr-slug}` from
  the resolved feature name, not the branch name: lowercase it, replace non-alphanumeric runs
  with `-`, trim `-`, and require `[a-z0-9-]+` (`feat/foo` with feature `foo` yields `foo`). Direct
  `## [Unreleased]` edits are acceptable as a fallback when `changelog.d/` cannot be used (e.g.,
  pre-convention repos).
- Update tracked documentation when the operator explicitly requests it, when shipped behavior
  would make its canonical source factually false, or when a new public contract/operator workflow
  otherwise has no documentation. Every document must name a concrete audience and purpose.
  Change the single closest source of truth and create a new page only when no existing page serves
  that purpose; do not duplicate the same explanation per service or add implementation/release
  narrative to reference documentation. Preserve the nearest local format. The default budget is
  one existing section and at most 20 added nonblank lines, or 80 total lines for a necessary new
  document. A plan may exceed it only through
  `Documentation budget: extended — {reason}; max {N} lines`. With no local format, use one title,
  a one-sentence purpose, and only task-oriented sections; omit introductions, conclusions, FAQs,
  architecture tours, repeated facts, and examples not required to use the changed behavior.
- If §3 Tech Stack or §4 Golden Commands of CLAUDE.md changed, update those sections in the same
  PR — do not let CLAUDE.md drift from the repo.
- If the change establishes a decision, pattern, or constraint that future work must respect,
  append a one-line bullet to `docs/knowledge.md` with the matching tag prefix (`[decision]`,
  `[pattern]`, `[stack]`, `[constraint]`).
- If the repo has an OpenAPI spec (`openapi/openapi.yaml` or similar) and the change touches
  endpoints, bump `info.version` in the same commit as the spec change — never in a separate
  commit.
- **Internal distribution rule of the team-harness repository** — matches the shipped pipeline
  default (the coordinator bumps the project version once per PR; see
  `agents/_shared/delivery-mechanics.md § 1`). Changes touching distributed runtime assets bump
  all five current version sites in the same PR (Codex/installer sites remain optional for
  historical repositories) and write the `## [X.Y.Z]` CHANGELOG section directly.
  **Trade-off:** concurrent PRs touching distributed assets race on the version line
  (rebase-and-rebump). `changelog.d/{pr-slug}.md` remains the batch/fallback path for grouped
  sessions, not team-harness's own default. Full site list:
  `docs/cost-and-caching.md § "team-harness's own version sites"`.
- **New hooks must be authored in TypeScript, not Bash** (Decision A = closed). See
  `docs/opencode-distribution-roadmap.md` § Cross-Harness Authoring Mandate.
