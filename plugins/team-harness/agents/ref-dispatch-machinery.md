---
name: ref-dispatch-machinery
description: Shared initiative overview and dependency-aware multi-project coordination.
model: opus
color: cyan
---

# Initiative coordination

Main coordinates initiatives without another orchestrator.

## Initiative path composition

Use `workspace` and its identity helper. Reuse the file home or verified effort
Page. Remote initiatives need no sibling paths. Dispatch separates locator,
checkout and operational storage; Main persists remote returns.

## Repo-identity verification

Use Git common-directory and remote identity to distinguish projects from
worktrees or aliases of the same repository. Do not treat a second checkout as
another service solely because its path differs.

## Multi-project sequencing

Record repositories, objectives and dependencies in the overview. Keep dependent
changes sequential; delegate independent work with explicit ownership. Repository
boundaries require separate branches/PRs; preserve approved grouping and sequence.

## overview.md — you are the sole writer

Main keeps the initiative overview coherent and updates one row per project
after meaningful progress. Reuse the same file or logical overview in the bound
effort Page rather than versioned siblings. Remote mode needs no local overview.

### Template (obsidian shown; local omits the obsidian-only frontmatter keys)

```markdown
---
type: initiative-overview
initiative: {initiative-slug}
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
projects: [{project-slug}]
---

# Initiative: {initiative-slug}

## Review Summary
The common outcome and current state.

## Functional Description
Behavior across participating projects.

## Projects
| Project | Branch | Version | PR | Status |
| --- | --- | --- | --- | --- |
| {project} | {branch or —} | {version or —} | {URL or —} | {observed status} |

## Big-Picture Plan
Dependencies, sequence and material decisions.
```

### Section-ownership map

Main reconciles the shared overview; specialists own explicitly assigned service
artifacts. Serialize shared-file updates and preserve existing useful context.

### No-fork / consolidation invariant

One overview and one row per project keep continuity. Native task transport
carries results; no leader roster, lane state or gate stream is required.

## What left this file, and where it went

Legacy multi-coordinator and gate bookkeeping remains in Git history. Current
coordination uses native tasks, shared workspace notes and canonical OpenSpec.
