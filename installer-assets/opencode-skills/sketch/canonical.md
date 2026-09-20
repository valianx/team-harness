
# Sketch

Help the user see what the proposed work will deliver and settle design questions
before implementation. Main handles the request in the current flow; selecting
this skill does not start a pipeline or require a specialist or another gate.

Use [workspace](../workspace/SKILL.md) for the effort's configured local or Obsidian
home. Read the relevant intent, plan and existing sketches. Reuse a sketch when it
already describes the same decision; create only the views needed for this request.

## Choose a useful view

| Question to review | Sketch |
| --- | --- |
| What will the screen show? | Low-fidelity UI wireframe with relevant components and states |
| What requests and responses change? | API examples with methods, paths and changed fields |
| What data and relationships change? | Mermaid ER diagram of the affected model |
| What commands or library calls will exist? | CLI table or public signatures with a usage example |
| What messages will be published? | Event or message examples |
| How will services call each other? | Mermaid sequence diagram |
| How will data move and recover? | Migration steps and rollback notes |

Keep sketches small, concrete and focused on the proposed change. Mark assumptions,
alternatives and undecided points; use example values rather than real credentials
or personal data. A preview should expose choices, including relevant failure states.

Save text sketches as `.md` under `{workspace}/sketches/`, using tables, fenced
examples or Mermaid as appropriate. For a visual UI preview, preserve the existing
`ui-wireframe.html` capability: self-contained semantic HTML, grayscale layout,
inline styles and no scripts or external resources. Link it from an existing
Markdown plan or note when present; otherwise report its path directly. Do not
create an index, fixed sketch set or empty files
merely because this skill was selected.

For an existing type's skeleton, read only its portion of the installed
`agents/ref-architect-design.md` section **Sketches — triggers and skeletons**.
From this skill, Claude Code and Codex use `../../agents/ref-architect-design.md`;
OpenCode uses `../../th-references/agents/ref-architect-design.md`. Its classification
table and required set belong to active pipeline Design, not standalone selection.

## Review and continue

Present the sketch or a directly usable preview, link its file and identify the
decisions the user can review. When the request is to see the proposal first,
present it before implementing the proposed product change. A sketch request
alone does not approve that implementation.

In [spec](../spec/SKILL.md), link requested sketches from `01-plan.md` and use the
feedback in the existing proposal, design or tasks when it changes intended
behavior. OpenSpec remains the canonical intent. Reuse the flow's existing approval;
the sketch adds no second approval step. Implementation and validation consult the
relevant agreed sketches alongside that intent; reconcile stale sketches visibly.

In an active pipeline, keep its existing sketch selection, artifact formats,
review and state ownership. Outside it, keep sketches as workspace decision aids
without pipeline state, classification records or a sketch-guard invocation.
