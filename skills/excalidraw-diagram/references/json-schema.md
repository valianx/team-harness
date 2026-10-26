# Excalidraw JSON Schema

## Element Types

| Type | Use For |
|------|---------|
| `rectangle` | Processes, actions, components |
| `ellipse` | Entry/exit points, external systems |
| `diamond` | Decisions, conditionals |
| `arrow` | Connections between shapes |
| `text` | Labels inside shapes |
| `line` | Non-arrow connections |
| `frame` | Grouping containers |

## Common Properties

All elements share these:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `type` | string | Element type |
| `x`, `y` | number | Position in pixels |
| `width`, `height` | number | Size in pixels |
| `strokeColor` | string | Border color (hex) |
| `backgroundColor` | string | Fill color (hex or "transparent") |
| `fillStyle` | string | "solid", "hachure", "cross-hatch" |
| `strokeWidth` | number | 1, 2, or 4 |
| `strokeStyle` | string | "solid", "dashed", "dotted" |
| `roughness` | number | 0 (smooth), 1 (default), 2 (rough) |
| `opacity` | number | 0-100 |
| `seed` | number | Random seed for roughness |

## Text-Specific Properties

| Property | Description |
|----------|-------------|
| `text` | The display text |
| `originalText` | Same as text |
| `fontSize` | Size in pixels (16-20 recommended) |
| `fontFamily` | Selected native family; load it before measuring text |
| `textAlign` | "left", "center", "right" |
| `verticalAlign` | "top", "middle", "bottom" |
| `containerId` | ID of parent shape |
| `labelPosition` | Arrow labels: normalized arc length, 0–1, on the whole path |

## Arrow-Specific Properties

| Property | Description |
|----------|-------------|
| `points` | Array of [x, y] coordinates |
| `startBinding` | Connection to start shape |
| `endBinding` | Connection to end shape |
| `elbowed` | `true` for a native orthogonal arrow; keep its editable points |
| `fixedSegments` | Native fixed elbow segments, or null |
| `startArrowhead` | null, "arrow", "bar", "dot", "triangle" |
| `endArrowhead` | null, "arrow", "bar", "dot", "triangle" |

## Binding Format

```json
{
  "elementId": "shapeId",
  "fixedPoint": [1, 0.5],
  "mode": "orbit"
}
```

This is the pinned editor's binding format; `[1, 0.5]` is the right-side midpoint.
Use `inside`, `orbit` or `skip` only with the semantics supported by that editor.
The target lists each attached arrow in `boundElements`. A label's `containerId`
names its arrow, and the arrow lists that label as `{ "id": "labelId", "type": "text" }`.
Validate both directions with `render_excalidraw.py --validate-only`; then use
[native verification](native/README.md) to detect unsupported rendering semantics.

## Rectangle Roundness

Add for rounded corners:
```json
"roundness": { "type": 3 }
```
