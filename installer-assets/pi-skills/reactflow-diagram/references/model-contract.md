# Internal model contract

The agent generates JSON; the operator does not need to supply a schema.
[starter/src/types.ts](starter/src/types.ts) defines the supported fields and
the starter's runtime validator rejects unsupported fields before layout.
`package.json` and its lockfile identify the copied kit and dependencies.

## Schema version 1

| Record | Fields |
| --- | --- |
| Model | `schemaVersion: 1`, `title`, `theme: "presentation"`, `direction: "right"` or `"down"`, `sources`, `nodes`, `groups`, `edges`, `review`, `views`, `steps`, optional `flow` |
| Flow | `primary: string[]` of ordered request-edge IDs, `supportSide: "above"` or `"below"` |
| Source | `id`, `title`, `locator`, `status: "read"` or `"unavailable"`, optional `material` |
| Node | `id`, `kind`, `label`, optional `description` and `parent`, `evidence` |
| Group | Node fields without `kind`; optional `parent` names another group |
| Edge | `id`, `from`, `to`, optional `label`, `description` and `interaction`, `evidence` |
| Review | `unresolved: string[]`, `decisions: string[]`, optional `assessor` |
| View | `id`, `label`, `nodeIds`, `edgeIds`, optional `outside` and `continuations` |
| Step | `id`, `title`, optional `description`, `focus: string[]` |

Node kinds are `service`, `gateway`, `database`, `queue` and `external`; groups
are the sixth visual variant. Semantic node/group/edge IDs are globally unique;
source, view and step IDs are unique within their own collections. Use stable
meaningful IDs so a correction changes a label or relationship without replacing
unaffected entities. IDs start with a letter or digit and contain only letters,
digits, periods, underscores and hyphens.

Optional `interaction` uses `request` for the primary ingress/navigation/provider chain,
`call` for supporting specialists, `response` for synchronous returns, `event` for
asynchronous notifications and `persistence` for storage operations. Omission stays
neutral; classify from source meaning independently of component colors.

For an approved horizontal flow, use `direction: "right"`, derive `flow.primary` as a simple contiguous request path and `flow.supportSide` from its composition. This internal intent has no coordinates; generic architectures, including vertical layouts, can omit it. A perspective retains it only when the complete primary path remains present. Incompatible group spans or unsatisfied intent remain explicit composition limits.

Every node, group and edge has evidence. The supported forms are:

```json
[
  { "source": "architecture-notes", "locator": "Request flow, paragraph 2" },
  { "inference": "The arrow direction is unclear in the scan", "decision": "Operator confirmed API to queue, message 8" }
]
```

`source` references a read source inventory ID; unavailable sources cannot serve
as evidence. `inference` states the rationale;
`decision` records its resolution when one exists. An unresolved material inference
also belongs in `review.unresolved`; inference is not a sourced fact. Add operator
corrections as conversation sources with message locators. Mark a source `read`
only after actually reading it. Keep required unavailable sources material until
access or an explicit scope decision resolves their effect.

## Hierarchy, views and steps

- Parents reference groups. The hierarchy is acyclic and supports
  root → group → subgroup → node; empty groups are valid.
- Edges connect nodes. Relationship cycles are valid and separate from group
  hierarchy cycles.
- `view.nodeIds` contains component IDs; the viewer retains their necessary
  ancestor groups. Both endpoints of every included edge must be members.
- When explicit views are defined, every model edge appears in at least one or has an
  `outside: [{ "edge": "edge-id", "reason": "Outside the requested perspective" }]`.
  Preserve the full model when splitting perspectives. With `views: []`, the full
  model is the implicit perspective.
- `continuations: [{ "edge": "edge-id", "view": "view-id" }]` points to an
  existing view that actually includes that edge. Describe the continuation context
  in the associated narrative/details.
- Step focus contains at least one modeled element ID; steps highlight and
  navigate without changing topology or geometry.

## Review and derived data

`review.unresolved` retains material questions. `review.decisions` records explicit
resolutions and declared omissions. An absent assessor means fidelity review is
pending; an assessor name alone is not the assessment evidence. Keep the actual
source-to-artifact comparison and its revision in the workspace.

Positions, dimensions, ports, routes, arbitrary CSS and unsupported layout overrides are not
model fields. Keep generated geometry and diagnostics separate. Model integrity,
source-fidelity assessment and rendered/geometry/build evidence answer different
questions; do not infer one from another.
