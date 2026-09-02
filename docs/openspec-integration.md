# OpenSpec Design integration

Team Harness uses OpenSpec as the canonical source of product intent, reached through two entry
points that share the identical `openspec/changes/` schema, naming, and archive path. The full
pipeline's Design phase (`@Team-Harness pipeline <task>`) retains both gates, state, specialist
routing, Freeze, validation, correction authority, and delivery, exactly as below. The coordinator-
only `/th:spec` lane (`skills/spec/SKILL.md`, `docs/pipeline-lanes.md § "The direct spec lane"`)
authors the same `proposal.md`/`tasks.md` (and `design.md`/spec deltas when a specced capability is
touched) directly, with one conversational approval and no workspace, state, or gate ceremony. Neither entry point adds a third OpenSpec lifecycle or a lane-specific artifact
layout; archive treats a change from either origin identically.

## Canonical source model

OpenSpec owns the repository-local change under `openspec/changes/<change>/`: `proposal.md`,
`specs/**/spec.md`, `design.md`, and `tasks.md`. TH never copies or paraphrases those artifacts
into a second editable specification. A change exists only for product behavior: it adds or modifies at least one capability. Installing a tool, delivering an already-approved change, and other repository chores use the normal branch and pull-request flow with no change directory. `openspec/config.yaml` records the per-artifact sizes and `tests/test_openspec_scope.py` enforces them on every active change.

Design pins the change once as a content identity over its canonical Markdown, with task
checkbox state normalized out, and records it in the control log. Every writable service owns
its OpenSpec change in its repository; Main records repository identities, dependency order,
content identities, and evidence-only dispositions as immutable inputs of the same Gate-1
presentation. Evidence-only repositories are readable context only and cannot supply acceptance
coordinates or become writable implicitly.

Every `#### Scenario:` in the change's delta specs is an acceptance criterion and validation
reads it directly. Dispatch prompts carry pointers to canonical coordinates, never copied
normative text; the operator projection `01-plan.md` links to the change and copies nothing.

## Single-pass Design

Main advances through these actions without requiring another operator command after each success:

1. Preflight Node.js `>=20.19.0`, npm, OpenSpec `1.9.0`, project initialization, and the generated
   integration for the active runtime. A compatible but uninitialized repository is initialized
   automatically; this is not an operator checkpoint.
2. Count `### Requirement:` headers across the bound change's `specs/*/spec.md` against
   `max_requirements_per_change` in `openspec/config.yaml`. A complete change that passes strict
   validation within the ceiling is reused without an architect. Otherwise dispatch one architect in
   `openspec-planning` mode; it follows the installed upstream `openspec-propose` or
   `openspec-update-change` skill and writes only the bound change. Past the ceiling it returns
   `design_status: oversize`, and Main records the live split, accept, or narrow choice as a
   `design.oversize` event before anything else exists.
3. Compute the content identity, generate the read-only `01-plan.md` projection, and present
   Gate 1. Only the live reply bound to that presentation appends the authority event and enters
   implementation.

Crossing the architect SLA produces one concise operator update and one
`agent.sla` observation. Main does not request heartbeats or inspect partial
artifacts, and elapsed time never stops or replaces the still-live architect.

Progress commentary is informational. Main pauses only for a mandatory TH gate, a material choice
not resolved by canonical artifacts, separately authorized external mutation, or a real blocker.

## Dependency and generated-skill ownership

If Node.js or npm is absent or incompatible, TH reports the exact prerequisite and does not install
Node. If the pinned OpenSpec CLI is absent/incompatible or an existing generated integration is
stale, TH presents one live install/update-or-abort decision. An approval installs exactly
`@fission-ai/openspec@1.9.0` without `sudo` or runs the required update.

When the compatible CLI reports an uninitialized repository, TH runs the exact upstream
`openspec init` command automatically. Codex protects `.agents` and `.codex`; if the bounded attempt reports
`INIT_SANDBOX_DENIED`, TH retries that exact argv once through native sandbox escalation with
`login:false` and verifies the resulting generated integration. No other failure code authorizes
that escalation. Generic initialization failures retain a sanitized diagnostic, expose no raw
stdout/stderr or secret-bearing values, and remain fail-closed.

OpenSpec remains the writer and owner of generated `openspec-*` skills and `opsx` commands. TH uses
the installed planning skills during Design and bounded apply instructions during authorized
implementation. It neither forks nor redistributes those generated files. The Claude, Codex, Go,
and OpenCode packages use the positive roots in `runtime/package-ownership.json`; consumer
OpenSpec integrations are preserved unchanged.

## Specialist consumption and authority

- Implementer reads the pinned OpenSpec task/design coordinates named in its capability lease.
  Apply instructions are guidance; they cannot select a phase, expand scope, release a gate, or publish.
- Tester and QA read pinned OpenSpec requirements/scenarios directly. Tester owns executable
  evidence; QA remains final acceptance owner on the frozen tree.
- Cleaner, security/adversary, delivery, state/events, nonces, corrections, Gate 1, Gate 3, and
  publication remain unchanged TH responsibilities.

After implementation begins, normal `tasks.md` progress is monotonic from pending to complete. A
completed checkbox that returns to pending leaves the identity unchanged; the regression is
recorded in the control log and the batch that owns the task is re-leased. Task text, structure, added or removed coordinates, or any other canonical change
alters the content identity, makes `01-plan.md` stale, and blocks the next dispatch until Design
regenerates and re-presents.

## Repository, local workspace, and Obsidian

Canonical OpenSpec Markdown always stays in the target repository. TH control log, projections,
reviews, and evidence stay in the configured TH workspace:

```text
repository/openspec/changes/<change>/...       canonical source
workspace/control/control.jsonl                authority log
workspace/inputs/openspec-pin.json             pinned content identity
workspace/01-plan.md                           operator projection
workspace/reviews/...                          TH validation evidence
```

When `logs_mode: obsidian`, `workspace` is the configured vault path and no local TH workspace
duplicate is created. The pin records the vault root, `mode: obsidian`, repository-relative
paths, and the content identity. Obsidian is therefore the audit/navigation surface, not a
second OpenSpec source.

Before Freeze, TH verifies that the pinned OpenSpec source set is present byte-for-byte below the
implementation checkout, tracked by Git, and included in the final base-to-candidate diff when
created or changed by this pipeline. A worktree boundary never moves canonical OpenSpec
artifacts into the workspace.

## Recovery and finalization

Recovery replays the valid prefix of `control/control.jsonl` and rebuilds projections before
routing; it never asks the operator to re-enter a workflow command. A workspace without a control
log is closed administratively with one events entry and offered inline continuation or a fresh
run. Source drift makes the projection stale and routes back to Design; a valid completed Design
resumes at Gate 1.

OpenSpec `sync` and `archive` remain outside implementation authority. They are offered only after
TH acceptance and the applicable Gate 3/operator authority. They cannot replace push/PR authority
or retroactively validate the shipped tree.
