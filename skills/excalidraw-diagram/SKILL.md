---
name: excalidraw-diagram
description: Use when an editable Excalidraw diagram is requested for a workflow, architecture or concept, including source-led composition and revisions.
---

# Editable Excalidraw diagrams

Create a readable native scene whose components and directed relationships match
the requested sources. Honor the approved reference and explicit engine choice.

## Workspace and artifacts

Reuse the bound [workspace context](../workspace/SKILL.md), or resolve it for
direct work. Main retains narrative returns and artifact links in that context.

Set `output_dir` to the explicit `deliverable_target` or declared real local
operational directory; file modes may use their bound home. URLs and opaque IDs
are context locators, not filesystem paths. For a file target, retain its exact
`source_file` and parent; otherwise use `{output_dir}/diagram.excalidraw`.
Place the PNG preview alongside unless another destination is requested.

Resolve references and helpers from this installation's `skill_root`. Use local
files and existing tools by default. Read [tool selection](references/tool-selection.md)
when an alternative is needed; connected destinations require scoped authorization.

## Compose the scene

1. Read supplied documents, images and editable scenes. Record component
   occurrences, directed relationships, labels, boundaries and uncertainties
   with source locators. Verify material missing facts against authoritative
   sources when needed.
2. For source-led work, approved references or revisions, read
   [composition](references/composition.md). Carry forward the approved reading
   axis, cards, typography, palette, zones and lanes. Choose a layout that makes
   the requested flow clear; distinguish component-role and relationship colors.
3. Represent every requested component occurrence and directed relationship.
   For a collection, give each flow a start, outcome and boundary; repeated
   components retain their meaning without joining unrelated flows.
4. Before revising an approved file, read the current human-edited scene and
   retain a recoverable backup. Apply scoped changes that preserve unaffected
   IDs, metadata, annotations, styles and positions. Historical generators
   produce drafts; the current scene is the revision source.
5. Build native editable arrows with coherent endpoints, supported bindings,
   native elbows by default for orthogonal routes and reciprocal bound labels.
   Use other native paths when the reference or geometry requires them. Load the
   selected fonts before measuring text. Reserve room for readable labels,
   their masks and visible arrowheads; route around unrelated elements.

Read [element templates](references/element-templates.md) and
[JSON format](references/json-schema.md) only when writing raw scene elements.
Use [palette defaults](references/color-palette.md) only when the source and
approved context supply no palette. Keep format details in these references.

## Verify the current revision

Final editable delivery requires [native verification](references/native/README.md)
with the reproducibly identified editor and renderer. Reuse a matching prepared
local tool environment; retain its dependency identity,
recovered scenes, editor captures, SVG/PNG exports and verification report.

For scenes with connections, pass a bound component ID. The verifier plans a drag
into free space within its enclosing bounds; unavailable space keeps proof pending.

```bash
node "{copied_references}/native/verify.mjs" "{source_file}" \
  --output-dir "{evidence_dir}" --output "{output_png}" \
  --edit-id "{bound_component_id}" --review
```

Start with the CLI summary and inspect the overview plus flagged crops. Read the
full report for relevant findings, and helper code only to diagnose checker failures. Use
`--focus ID,ID` to examine another region and `--before BACKUP` to compare revisions
at the same framing. Declare intended rows/columns through `--layout JSON` when
alignment or equal spacing matters. Geometry warnings need visual judgment;
missing observations and unresolved errors keep the scene a draft.
Reuse passing checks only while scene SHA-256, verifier/renderer identity and
invocation options match. Recheck changed views and their affected compositions.

Connection-free scenes record native binding verification as not applicable.
For desktop per-flow presentation, append `--presentation` and inspect actual
fitted typography; a collection overview alone cannot establish readability.

Keep four assessments separate:

- **Structural:** valid scene, unique IDs and coherent references.
- **Native editability:** actual editor import and recovery, a real pointer drag
  of a bound component, then recovery and exports with coherent arrows and labels.
- **Visual:** inspect current editor captures and recovered exports at the intended
  fitted view for readable text, clipping, overlaps, routing and visible direction.
  Check connection visibility independently of bound-label placement.
- **Source fidelity:** reconcile the recovered scene with the component and
  relationship inventory, including repeated occurrences and approved references.

A PNG from another exporter can support visual review; it cannot establish
bindings, elbows or label-position compatibility in the native editor.

## Bounded corrections and delivery

Allow at most three prerequisite-repair attempts per prospective composition.
A rejected preflight without a native render does not consume a visual
correction; the first actual native capture starts the initial assessment.

Inspect the initial composition, then use at most two corrective cycles.
Retain each observation and scoped causal change, re-verify and view the current
outputs after every correction. Preserve the current scene and backup on each
revision. Correct short connections by reserving measured label and arrowhead
clearance while retaining readable text and native bindings.
Keep the verifier and thresholds fixed while correcting composition; report
suspected checker defects separately. Compare each correction with its saved
pre-change scene and check both the intended improvement and surrounding routes.

Deliver the editable scene, faithful previews and retained evidence with the
assessment results and named limits. Failed or unavailable required checks keep
the result a draft. Link portable artifacts from the bound context; retain an
unsupported upload as pending and identify local files as local files.
