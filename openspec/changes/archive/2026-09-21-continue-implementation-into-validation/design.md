## Context

See proposal.md. The implement entry currently conditions its validation handoff on the request naming it, despite the shared flow's continuity objective. The earlier four-phase change is archived in this branch.

## Goals / Non-Goals

Clarify the default handoff consistently across the three hosts. Preserve existing tool selection, endpoint authority and native execution boundaries.

## Decisions

Use the shared phase reference and implement entry, including its authored Codex adapter and generated OpenCode projection. Implementation is followed by applicable validation; the two phases remain visible. A merged phase would obscure evidence timing, while another router or approval mechanism adds no useful behavior.

Amend the existing continuity requirement through this separate change. Keep the earlier archive intact and apply this delta to living specs only after verification.

## Risks / Trade-offs

Automatic continuation could be misread as broader authority. Keep explicit stop points, real missing decisions and publication scope intact. Prose and package checks do not prove live behavior in every host; report that limit.

## Migration Plan

Ship through the existing skill distribution and current PR version. No installation or runtime configuration change is required. Reverting this amendment restores the prior handoff wording.
