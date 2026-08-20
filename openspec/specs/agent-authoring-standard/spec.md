# agent-authoring-standard Specification

## Purpose
Agent and contract files follow one authoring standard — canonical skeleton, size budgets, context economy — verifiable by lint, with parity between semantic contracts and runtime adapters. Rationale: instruction files past the budget measurably degrade compliance, and their full body is paid on every dispatch.

## Requirements

### Requirement: A canonical authoring standard exists in-repo
`docs/agent-authoring.md` SHALL define the skeleton (role sentence → when-invoked steps → measurable criteria → literal output template → boundaries), the budgets (specialist agent ≤ 2,000 words / hard 500 lines; shared contract ≤ 1,500 words; references one level deep, TOC over 100 lines, split by execution path), and the authoring rules (per-line deletion test, one motivated rule over enumerations, one default plus one named escape hatch, one term per concept, no time-sensitive statements in living files, scarce emphasis). `agent-builder` and CLAUDE.md reference it as the binding standard for new and edited files.

#### Scenario: A new agent is authored
- **WHEN** `agent-builder` creates an agent file
- **THEN** the file follows the skeleton and fits the budget, and lint passes on first run

### Requirement: Lint verifies structure deterministically
`/th:lint` SHALL check per file class: word/line budgets (warning at 80%, fail at the hard cap), description-field format, explicit tools allowlist, reference depth of one, dangling section anchors, and TOC presence for long references.

#### Scenario: An agent file cites a retired section
- **WHEN** lint resolves cross-file section anchors
- **THEN** a reference to a non-existent section fails the check with the citing file and anchor named

### Requirement: Semantic contracts and runtime adapters stay in parity
Each role's semantic contract and its per-runtime adapters SHALL be checked for parity: a rule present in the semantic source but absent or contradicted in a projection is reported. Compressing already-compact adapters is not a goal; parity is.

#### Scenario: A contract rule changes without touching the Codex adapter
- **WHEN** the parity check compares the edited semantic source against generated and hand-written adapters
- **THEN** the missing propagation is reported before release

### Requirement: Oversized files are rewritten in stages with behavioral validation
Files above budget SHALL be rewritten highest per-dispatch cost first, preserving behavior: every removed rule is inferable, redundant with a single remaining site, or dead; security floors and gate contracts are never removed; the deterministic behavioral suite and a trial run validate each rewrite. Prose edits refactor whole sections and target net word reduction per file.

#### Scenario: A specialist agent is rewritten to budget
- **WHEN** the rewrite lands
- **THEN** the behavioral suite passes, the file meets budget, and no floor or gate semantics changed
