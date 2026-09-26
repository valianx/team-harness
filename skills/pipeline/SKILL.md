---
name: pipeline
description: Start the operator-selected coordinated Team Harness workflow.
disable-model-invocation: true
---

# Team Harness pipeline

Start when the operator selects this workflow. Main remains the current native
general agent and coordinates Spec, Implementation, Validation and Publication.
No nested orchestrator or TH permission ledger is needed.

Use [workspace](../workspace/SKILL.md) to reuse the effort's absolute home in
its configured local or Obsidian mode. Main coordinates with native tools and
permissions. Reuse authorization for unchanged work and ask only for a missing
decision. Specialists provide evidence and recommendations; Main judges them.

Apply [the OpenSpec lifecycle](../spec/references/lifecycle.md) at authoring,
resumption, candidate preparation and completion. Use
[create-pr](../create-pr/SKILL.md) for PR preparation and authorized publication.
Every completed repository-file change reaches create-pr preparation, even when
the operator did not initially request a PR and regardless of file type. Read-only
work and outputs outside the repository have no candidate to prepare. Publication
follows native permissions and honors an explicit operator stop or decline.
Use the shared [upstream-tool reference](../spec/references/upstream-tools.md)
for selected TEA/Superpowers work and its workspace outputs. Completion of a
relevant OpenSpec change includes upstream implementation verify before archive.
If continuing an existing spec effort, retain its completed provider stages and
pending work rather than restarting them.

- Spec: reuse suitable OpenSpec, complete missing decisions, keep a concise
  linked plan, and use [sketch](../sketch/SKILL.md) to present a data model for
  database changes and a wireframe for frontend work before Implementation.
  Other previews remain on demand.
- Implementation: group dependency-ready work by shared context and ownership.
  Delegate when useful, reuse the executor for relevant corrections and let it
  own ordinary tests. Parallelize independent work; serialize overlapping writes
  and Git mutations. Main can complete a small step without another handoff.
- Validation: run relevant checks, use independent reviewers for quality and
  risk, preserve findings and verify corrections.
- Publication: include completed archive and evidence in create-pr preparation
  for every repository change. Publish when native permissions allow and the
  operator has not explicitly stopped or declined; no initial PR request is
  needed for preparation.

Read [the shared development phases](../spec/references/development-phases.md) for
phase outputs, tool selection and evidence states, including real CRAP diagnostics.
Use that view in the existing plan. Retain spec's declared provider stages when
continuing it, plus explicit operator stops and the selected review decision.

Use existing specialists for their expertise, not as mandatory stops. Supply
the objective, owned scope, repository/workspace and relevant sources in the
native assignment. Accept a clear result with checks, findings and limits;
no separate packet, fixed report layout or result schema is needed. Reuse
applicable evidence and renew only what a correction affects. Independent
reviewers retain their perspective and Main decides how to address findings.

Keep the installed native model settings unless the operator selects a supported
override. Workflow simplification does not require changing reviewer models.
Historical helpers remain available for old records, outside current dispatch.
