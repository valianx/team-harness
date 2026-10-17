---
name: save-session
description: Save a concise workspace handoff with what worked, what not to retry, and the next step.
---

# Save session

Preserve enough context to resume the effort without rediscovering its decisions.
Main saves a logical handoff in the selected effort Page, or
`00-session-handoff.md` in file modes; no pipeline or extra agent is required.

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

Use this compact structure. Preserve the locator, verified source association,
original date, phase/task progress and useful evidence links; file readers retain
their metadata. Main uses guarded native edits and readback in remote mode:

```markdown
# Session Handoff: {feature}

Workspace: {selected context locator}
Source: {verified association; preserve existing file source metadata}

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
After verified persistence, report its location. Missing tools, access loss or an
uncertain write preserve the binding and pending reason; reconcile before retry,
without a local Markdown mirror or replacement effort.
