---
name: sketch
description: Present a data model before database changes and a wireframe before frontend work; create other sketches on demand in direct work, OpenSpec or pipeline.
---

# Sketch

Help the user see what the proposed work will deliver and settle design questions
before implementation. Main handles the request in the current flow; selecting
this skill does not start a pipeline or require a specialist or another gate.

Use [workspace](../workspace/SKILL.md) for the effort's configured local or Obsidian
home. Read the relevant intent, plan and existing sketches. Reuse a sketch when it
already describes the same decision; create only the views needed for this request.
Compare a reused preview with current requirements and the affected model or UI;
use existing plan/decision notes to recover prior presentation and agreement.

## Required before implementation

In every workflow, always create or update and present a data model when the work
changes the database, and a wireframe when it implements or changes frontend.
The user does not need to request `sketch` separately. In spec and pipeline,
deliver these during Spec before Implementation; if both surfaces change, deliver
both. Direct or resumed implementation fills a missing or stale preview before
working on that surface. Small fixes reuse an accurate preview and annotate the
affected portion; size does not remove the design outcome. Other views below
remain on demand. Work affecting neither surface needs no unrelated sketch.

**Database:** cover structure, persisted data and migrations, including changes
without added columns. Show the affected current and proposed entities, fields,
relationships and constraints, with the minimum delta needed for the objective.
For each new persisted field, state its requirement, producer and consumer, and
why existing data or a computed value does not suffice. Do not add speculative
fields for possible future use. Explain migration/backfill effects when relevant;
for data-only changes, show the affected model and operation even if its structure
stays the same. Use a diagram or table appropriate to the datastore.

**Frontend:** show the affected screens/components, layout, interactions and
relevant states, including changes to existing presentation or behavior. Reuse
existing wireframes where accurate and show the proposed difference. A small
change needs only the affected view and states, not a full application redesign.

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
OpenCode uses `../../th-references/agents/ref-architect-design.md`. Its skeletons
are examples; the applicability above governs current work, not historical
classification booleans or gate instructions in that reference.

## Review and continue

Present the sketch or a directly usable preview, link its file and identify the
decisions the user can review. Present required database/frontend previews before
implementing the affected product change. Honor an explicit request to review
first or stop at design. Otherwise continue already-authorized work after
resolving material design questions; presentation adds no blanket approval step.
A sketch request alone does not approve implementation.

In [spec](../spec/SKILL.md), link required and requested sketches from `01-plan.md` and use the
feedback in the existing proposal, design or tasks when it changes intended
behavior. OpenSpec remains the canonical intent. Reuse the flow's existing approval;
the sketch adds no second approval step. Implementation and validation consult the
relevant agreed sketches alongside that intent; reconcile stale sketches visibly.
During validation compare the actual model/migrations and frontend with those
decisions. Surface unexplained fields or UI additions and resolve their necessity
and scope: remove unnecessary additions, or update and present a justified design
change and reconcile canonical intent before dependent work. Resolve missing
material scope decisions with the operator; preserve authority already given.
Passing tests alone do not justify additions. Keep working previews in the
selected workspace, outside commits unless needed as a durable deliverable.

In every flow, keep sketches as workspace decision aids with their useful formats
and assigned ownership. They require no fixed set, classification record or
sketch-guard invocation.
