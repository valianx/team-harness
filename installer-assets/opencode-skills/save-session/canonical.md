
# Save session

Preserve enough context to resume the effort without rediscovering its decisions.
The current agent writes `00-session-handoff.md` in the selected workspace; this
does not start a pipeline or require another agent.

Use the active runtime's TH workspace preferences. In Obsidian mode, use the
configured vault and subfolder; otherwise use the repository's local workspace.
Prefer the workspace already bound to the current effort. If the request names
another one, resolve that destination. Ask when multiple plausible destinations
remain or a write would replace unrelated content.

Read the available plan, state and execution evidence. Derive three useful fields:

- **What Worked:** confirmed approaches and decisions to retain.
- **What NOT to Retry:** failed approaches and options already ruled out.
- **Next Step:** the next concrete action and any prerequisite.

An explicit request to save the handoff authorizes this scoped local write. Reuse
that request rather than asking the operator to approve the same action again.
If the operator only asks to preview a handoff, show it without saving. Native
permissions govern the write; a refusal is reported as a write outcome, not an
operator decline or permission to widen access.

Use this compact structure, adding the workspace's Obsidian frontmatter when
applicable:

```markdown
# Session Handoff: {feature}

### What Worked
- {confirmed approach or decision}

### What NOT to Retry
- {failed or ruled-out approach}

### Next Step
- {next action and prerequisite}
```

Keep secrets, credentials and raw execution logs out of the handoff. Preserve
the operator's language and the shared
[voice guidance](../../agents/_shared/operational-rules.md#voice).
After a successful write, report its location; retain a precise pending reason
if it could not be saved.
