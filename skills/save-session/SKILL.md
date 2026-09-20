---
name: save-session
description: Save a concise workspace handoff with what worked, what not to retry, and the next step.
---

# Save session

Preserve enough context to resume the effort without rediscovering its decisions.
The current agent writes `00-session-handoff.md` in the selected workspace; this
does not start a pipeline or require another agent.

Use [workspace](../workspace/SKILL.md) to select or reuse the effort's home.
An existing binding takes precedence over the current checkout name or date.
Ask when multiple plausible destinations remain or a write would replace
unrelated content.

Read the available plan, state and execution evidence. Derive three useful fields:

- **What Worked:** confirmed approaches and decisions to retain.
- **What NOT to Retry:** failed approaches and options already ruled out.
- **Next Step:** the next concrete action and any prerequisite.

An explicit save request or the owning flow's authorized context work covers this
scoped write. Reuse that authority rather than asking for the same action again.
If the operator only asks to preview a handoff, show it without saving. Native
permissions govern the write; a refusal is reported as a write outcome, not an
operator decline or permission to widen access.

Use this compact Markdown structure. Preserve metadata used by existing readers;
Obsidian mode alone does not require extra frontmatter:

```markdown
# Session Handoff: {feature}

Workspace: {selected absolute workspace}
Source: {canonical Git common directory or projectless working directory}

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
