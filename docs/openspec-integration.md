# OpenSpec Design integration

Team Harness uses OpenSpec as the canonical source of product intent inside the existing Design
phase. It does not add another pipeline entry point or lifecycle. The normal entry remains
`@Team-Harness pipeline <task>` and TH retains both gates, state, specialist routing, Freeze,
validation, correction authority, and delivery.

## Canonical source model

OpenSpec owns the repository-local change under `openspec/changes/<change>/`: `proposal.md`,
`specs/**/spec.md`, `design.md`, and `tasks.md`. TH never copies or paraphrases those artifacts
into a second editable specification. It stores a hash-bound snapshot at
`<workspace>/inputs/openspec-snapshot.json` and a minimal operational overlay at
`<workspace>/plan/openspec-traceability.json`.

Every TH acceptance or execution item references stable OpenSpec coordinates. Every applicable
OpenSpec requirement, scenario, design decision, and task maps back to a TH item or carries an
explicit exclusion. Non-direct mappings are disclosed as `split`, `merged`, `th-extension`, or
`excluded` with a rationale. `ambiguous`, missing reverse coverage, stale hashes, dangling
coordinates, or copied normative text block Gate 1.

## Continuous two-pass Design

Main advances through these actions without requiring another operator command after each success:

1. Preflight Node.js `>=20.19.0`, npm, OpenSpec `1.9.0`, project initialization, and the generated
   integration for the active runtime.
2. Dispatch a fresh architect in `openspec-planning` mode. It follows the installed upstream
   `openspec-propose` or `openspec-update-change` skill and writes only the bound OpenSpec change.
3. Run OpenSpec status and strict validation, extract stable coordinates, and capture the snapshot.
4. Dispatch a fresh architect in `openspec-overlay` mode. It adds only repository ownership,
   specialist routing, file scope, constraints, quality IDs, Freeze/evidence controls, rollback,
   and delivery grouping.
5. Validate snapshot freshness and bidirectional traceability, then present the existing Gate 1.

Progress commentary is informational. Main pauses only for a mandatory TH gate, a material choice
not resolved by canonical artifacts, separately authorized external mutation, or a real blocker.

## Dependency and generated-skill ownership

If Node.js or npm is absent or incompatible, TH reports the exact prerequisite and does not install
Node. If the pinned OpenSpec CLI or generated runtime integration is absent or stale, TH presents
one live install/update-or-abort decision. An approval installs exactly
`@fission-ai/openspec@1.9.0` without `sudo`, then runs upstream `openspec init` or `openspec update`
and verifies the result.

OpenSpec remains the writer and owner of generated `openspec-*` skills and `opsx` commands. TH uses
the installed planning skills during Design and bounded apply instructions during authorized
implementation. It neither forks nor redistributes those generated files. The Claude, Codex, Go,
and OpenCode packages use the positive roots in `runtime/package-ownership.json`; consumer
OpenSpec integrations are preserved unchanged.

## Specialist consumption and authority

- Implementer reads pinned OpenSpec task/design coordinates plus its TH execution shard. Apply
  instructions are guidance; they cannot select a phase, expand scope, release a gate, or publish.
- Tester and QA read pinned OpenSpec requirements/scenarios directly. Tester owns executable
  evidence; QA remains final acceptance owner on the frozen tree.
- Cleaner, security/adversary, delivery, state/events, nonces, corrections, Gate 1, Gate 3, and
  publication remain unchanged TH responsibilities.

After implementation begins, the snapshot verifier accepts only authorized monotonic task checkbox
changes from pending to complete. Task text, structure, added/removed coordinates, rollbacks, or any
other canonical change block the next dispatch and require reconciliation.

## Repository, local workspace, and Obsidian

Canonical OpenSpec Markdown always stays in the target repository. TH state, snapshot, overlay,
decisions, reviews, and evidence stay in the configured TH workspace:

```text
repository/openspec/changes/<change>/...       canonical source
workspace/inputs/openspec-snapshot.json        pinned identity and navigation
workspace/plan/openspec-traceability.json      TH execution overlay
workspace/reviews/...                          TH validation evidence
```

When `logs_mode: obsidian`, `workspace` is the configured vault path. Snapshot metadata records the
vault root, `mode: obsidian`, repository-relative artifact paths, coordinates, line numbers, and
content hashes. Obsidian is therefore the audit/navigation surface, not a second OpenSpec source.

## Recovery and finalization

Durable state records the bound change, repository root, preflight result, current Design pass,
snapshot/overlay paths and hashes, and one next action. Recovery resumes preflight, an already
approved provisioning operation, upstream planning, snapshot capture, or overlay generation at the
recorded boundary. It does not ask the operator to re-enter a workflow command. Source drift routes
to reconciliation; a valid completed Design resumes at Gate 1.

OpenSpec `sync` and `archive` remain outside implementation authority. They are offered only after
TH acceptance and the applicable Gate 3/operator authority. They cannot replace push/PR authority
or retroactively validate the shipped tree.
