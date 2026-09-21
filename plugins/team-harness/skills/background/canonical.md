
# Background work

Identify the concrete objective, repository/worktree, ownership and expected
result. Use the active host's native task or background-session capability so
independent work can proceed while Main continues. Preserve other writers' edits
and serialize overlapping writes. Reuse the selected local or Obsidian workspace.

Native permissions and approvals remain in effect. TH does not set
`acceptEdits`, build its own tool allowlist or bypass prompts for a background
process. If the host cannot perform the requested action unattended, report that
specific limit and continue useful work within available capabilities.

When the user explicitly selects an existing HerdR agent, use
`agents/_shared/herdr-agent-messaging.md` and the packaged
`skills/pipeline/scripts/herdr-message.mjs` adapter. It preserves literal text,
target identity and delivery status. Do not blindly resend an uncertain delivery.

If an external CLI session is explicitly requested, use the named native runtime
and its normal permissions. Keep logs in temporary storage or the shared workspace.
If no background facility exists, explain that limit and offer direct continuation
or a prepared command the user can run. Report the actual handle, status, result
and retrieval method; starting work does not prove completion.
