# Specialist dispatch

Give each specialist an objective, owned files or read-only scope, canonical
repository/worktree, selected absolute workspace, relevant inputs and expected
result. Explain concurrent ownership so it preserves others' edits.

Use native delegation and permissions. The assignment is context, not an
execution capability. Main coordinates overlapping edits and Git mutations;
independent tasks may proceed concurrently. Reuse useful sessions with delta context.

Specialists may write assigned deliverables and workspace notes when their role
permits it. PR review specialists stay read-only. Use
`agents/_shared/output-template.md` for reports. Historical lease helpers
support old records only; they are not a dispatch prerequisite.
