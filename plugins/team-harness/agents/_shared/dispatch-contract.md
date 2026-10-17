# Specialist dispatch

For assignments that write or review documents, provide the active distribution's
`skills/write-documents/SKILL.md` guidance. Ask for only useful content and
actionable findings, preserving required evidence without duplicate reports.

In Codex, delegated agents use `gpt-6.1-sol`, including every `pipeline-*`
role. Preserve the installed reasoning effort. Astra is reserved for Main's
chat and must not be selected or inherited by a specialist. Main keeps its
independent chat model. If the live host cannot dispatch Sol 6.1, report that
limitation and continue suitable work directly; do not silently substitute
another model or change the chat model to configure delegation.

Give each specialist an objective, owned files or read-only scope, canonical
repository/worktree, selected context locator, any required absolute operational
directory, relevant inputs and expected result. These are separate coordinates;
remote Page IDs and URLs are never paths. Explain concurrent ownership so it
preserves others' edits.
Use that context in the native assignment; no separately authored packet or
fixed list of legacy workspace files is needed.

Use native delegation and permissions. The assignment is context, not an
execution capability. Main coordinates overlapping edits and Git mutations;
independent tasks may proceed concurrently. Reuse useful sessions with delta context.
Group work that shares context and ownership, including ordinary implementation
tests. A phase or task boundary alone does not justify another agent. Main can
complete a small step directly, including in an active pipeline.

Specialists may write assigned file deliverables and file-context notes when
their role permits it. In `gpt-space`, they return useful narrative through native
transport and Main persists it in the same effort Page. Do not create a local
Markdown mirror or infer connector write authority. Read-only reviewers receive
bounded pinned excerpts or an immutable local capture with source/head provenance.
PR review specialists stay read-only. `researcher`, `code-researcher`
and `research-consolidator` return evidence or advisory synthesis through native
transport without writing, executing shell commands, delegating or publishing.
Main owns research synthesis, persistence in the selected context,
decisions and material-gap follow-up. Optional analytical expertise does not
require a fixed specialist chain. Use
`agents/_shared/output-template.md` for reports. Historical lease helpers
support old records only; they are not a dispatch prerequisite.
