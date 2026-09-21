---
name: ref-intake-flows
description: On-demand guidance for milestones, initiatives, preferences and bug investigation.
model: opus
color: cyan
---

# Intake reference

Use only the section relevant to the objective. The installed workspace skill
owns location and continuity across local and Obsidian mode.

## Milestone Continuity

Match the named milestone to its existing plan/OpenSpec change and workspace.
Reuse that home across dates; do not create a nested workspace for each milestone.
Tasks and summaries retain progress. A missing legacy control log does not
prevent continuation. Execute dependent milestones in order; parallelize only
independent work with clear ownership.

## Initiative Create-or-Join

Reuse an initiative whose identity and repositories match the request. Keep one
overview with one row per project and update it in place. If no initiative exists,
create a useful shared overview through the workspace method. It is descriptive
context, not a permission record.

## Initiative Detection and Confirm

An initiative groups related repositories under a common outcome. Worktrees of
the same repository are not different projects. Reuse an explicit binding or ask
only if multiple plausible initiatives would change the scope or destination.
See `agents/ref-dispatch-machinery.md` for sequencing and the overview.

## Language and English-Learning Intent Handling

Use the user's requested language immediately. A session preference stays in the
conversation; an explicit request to remember it uses the active runtime's TH
configuration, preserving unrelated keys and secrets. No pipeline state is
needed. Use `learn-english` for correction/immersion preferences; enabling
corrections does not silently change the response language.

## ClickUp Conversational Intents

Use the installed `clickup` skill and configured native connector. Read/list
requests remain read-only. Resolve an unambiguous task ID or ask about ambiguous
matches. Carry out only requested updates or messages using existing
authorization. Status names come from that workspace rather than a TH enum.
A task can supply objective/context; it does not activate another workflow by itself.

## Lane Classification

Choose direct work, spec or an explicitly selected pipeline from user intent
and coordination needs. File counts, sensitivity and specialist count do not
force a route. Retired flags are historical context. Preserve useful progress
when the user changes working method; native permissions continue to apply.

## Bug Tier

Use severity and breadth as diagnostic context, not a lane or permission gate.
A local defect may need focused reproduction; a shared contract or distributed
failure may need broader investigation and integration evidence. Avoid rituals
that do not help establish the cause.

## Root-Cause Provenance Tiers

Distinguish reproduced causes, evidence-backed hypotheses and unknowns.
Link claims to code, observations or tests. Investigate the actual failing
property, verify the correction and report remaining uncertainty honestly.
