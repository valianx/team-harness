## Context

See proposal.md. Main currently owns validate/create-pr execution. Pipeline QA
and delivery have different contracts; reusing them would broaden existing roles.

## Goals / Non-Goals

Provide two bounded executors using native agent configuration and the existing
workflow methods. Preserve pipeline execution, optional review choice, current
chat model and local/Obsidian evidence ownership. No DB/frontend surface applies.

## Decisions

- Add spec-validator and pr-creator. The former executes selected checks and
  upstream assessments, writes workspace evidence and returns findings without
  repairing product code. The latter executes create-pr's preparation and
  authorized publication, including scoped candidate assembly when assigned.
- Main supplies the absolute repository/workspace, scope, candidate/evidence,
  provider entries and authorized endpoint. Main owns decisions and serializes
  repository mutations. Agents do not launch a second coordinator or recurse.
- Spec routes the two phases explicitly. Direct validate/create-pr can use the
  same executors; an active pipeline keeps its existing role/delivery mechanics.
  Inside an assigned role, each skill executes in place rather than delegating again.
- Use Sol/high for validation and Sol/medium for PR execution on Codex/OpenCode;
  Opus with the same source efforts on Claude Code. Extend the existing model
  projection/conversion data only for these roles. Global remapping of Opus to
  Sol is rejected because it changes unrelated pipeline and review assignments.
- Reuse preparation across create-pr's two checkpoints and provider evidence
  across validation and publication. Main still performs the selected independent
  candidate review and judges findings; delegation adds no scoring authority.

## Risks / Trade-offs

- Native roles may not yet be loaded in a running host: report the limitation;
  use a supported native explicit model/instruction invocation when available,
  never claim file generation proves live activation.
- Delegated publication could duplicate a push/PR: existing identity, exact branch,
  authorization and idempotency checks remain in create-pr.
- Model routing could affect unrelated roles: regression tests cover concrete
  custom models, ordinary Opus mapping and JS/Go parity alongside the new roles.
- Extra context can cost tokens: pass bounded inputs and reuse agent sessions;
  no numerical savings claim or inference-quality benchmark is part of this change.
