# Specialist dispatch

In Codex, delegated agents use `gpt-6.1-sol`, including every `pipeline-*`
role. Preserve the installed reasoning effort. Astra is reserved for Main's
chat and must not be selected or inherited by a specialist. Main keeps its
independent chat model. If the live host cannot dispatch Sol 6.1, report that
limitation and continue suitable work directly; do not silently substitute
another model or change the chat model to configure delegation.

Give each specialist an objective, owned files or read-only scope, canonical
repository/worktree, selected absolute workspace, relevant inputs and expected
result. Explain concurrent ownership so it preserves others' edits.
Use that context in the native assignment; no separately authored packet or
fixed list of legacy workspace files is needed.

Use native delegation and permissions. The assignment is context, not an
execution capability. Main coordinates overlapping edits and Git mutations;
independent tasks may proceed concurrently. Reuse useful sessions with delta context.
Group work that shares context and ownership, including ordinary implementation
tests. A phase or task boundary alone does not justify another agent. Main can
complete a small step directly, including in an active pipeline.

Specialists may write assigned deliverables and workspace notes when their role
permits it. PR review specialists stay read-only. Use
`agents/_shared/output-template.md` for reports. Historical lease helpers
support old records only; they are not a dispatch prerequisite.
