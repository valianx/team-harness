# React Flow Patterns (@xyflow/react v12+)

Reference for graph-specific composition. Use the presentation's semantic theme variables and the current official @xyflow/react documentation for API details. Fit nodes, edge labels and tooltips inside the shared scene safe area, then inspect readability at the meeting viewport; fitView alone is insufficient.

---

## Custom Node Types

Register custom nodes via the `nodeTypes` prop on `<ReactFlow>`. Each custom node is a React component that receives `NodeProps`.

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";

/** A node with an icon, title, and description. */
function ServiceNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 min-w-[180px]">
      <Handle type="target" position={Position.Top} className="!bg-scene-accent !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-xl">{data.icon}</span>
        <span className="font-semibold text-sm">{data.label}</span>
      </div>
      {data.description && (
        <p className="text-xs text-scene-muted mt-1">{data.description}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-scene-accent !w-3 !h-3" />
    </div>
  );
}

/** A decision diamond node. */
function DecisionNode({ data }: NodeProps) {
  return (
    <div className="rotate-45 w-16 h-16 flex items-center justify-center bg-scene-surface border-2 border-scene-accent">
      <Handle type="target" position={Position.Top} className="!bg-scene-accent" />
      <span className="-rotate-45 text-xs font-medium text-center">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-scene-accent" />
      <Handle type="source" position={Position.Right} id="alt" className="!bg-scene-accent" />
    </div>
  );
}

/** A group/container node for visual grouping. */
function GroupNode({ data }: NodeProps) {
  return (
    <div className="p-4 min-w-[300px] min-h-[200px] rounded-xl border-2 border-dashed border-scene-border bg-scene-surface">
      <span className="text-xs font-medium text-scene-muted uppercase tracking-wider">{data.label}</span>
    </div>
  );
}

// Register in your FlowScene:
const nodeTypes = { service: ServiceNode, decision: DecisionNode, group: GroupNode };
```

---

## Edge Styles and Animations

```tsx
import { MarkerType, type Edge } from "@xyflow/react";

// Animated dashed edge (data flow)
const dataFlowEdge: Edge = {
  id: "e1-2",
  source: "node1",
  target: "node2",
  animated: true,
  style: { stroke: "var(--scene-accent)", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "var(--scene-accent)" },
};

// Labeled edge
const labeledEdge: Edge = {
  id: "e2-3",
  source: "node2",
  target: "node3",
  label: "HTTP/REST",
  labelStyle: { fill: "var(--scene-muted)", fontSize: 11, fontFamily: "monospace" },
  labelBgStyle: { fill: "var(--scene-surface)", fillOpacity: 0.9 },
  labelBgPadding: [4, 8] as [number, number],
};

// Smoothstep edge (orthogonal routing)
const smoothEdge: Edge = {
  id: "e3-4",
  source: "node3",
  target: "node4",
  type: "smoothstep",
  style: { stroke: "var(--scene-muted)", strokeWidth: 1.5 },
};
```

---

## Highlight Steps Pattern

Highlight steps let the presenter walk through a graph node-by-node. Each step is an array of node IDs to highlight simultaneously.

```tsx
const highlightSteps: string[][] = [
  ["client"],                          // Step 1: start at client
  ["client", "api-gateway"],           // Step 2: request hits gateway
  ["api-gateway", "auth-service"],     // Step 3: auth check
  ["api-gateway", "order-service"],    // Step 4: order processing
  ["order-service", "database"],       // Step 5: persistence
];
```

Use the template's active-scene step contract and preserve authored node/edge styles. The presentation advances available highlight steps before the next slide; graph-focused keys retain graph behavior. Respect reduced motion for animated edges.

---

## Tooltip Pattern

Add `tooltip` to node data for hover information:

```tsx
const nodes: Node[] = [
  {
    id: "api",
    type: "service",
    position: { x: 200, y: 100 },
    data: {
      label: "API Gateway",
      icon: "🌐",
      description: "Kong + rate limiting",
      tooltip: "Handles 10K req/s. Rate limits at 100 req/min per client. JWT validation at edge.",
    },
  },
];
```

---

## Layout Helpers

Position nodes manually for predictable layouts. Use a grid system:

```tsx
const GRID = { x: 250, y: 150 };  // Spacing between nodes

function gridPos(col: number, row: number): { x: number; y: number } {
  return { x: col * GRID.x, y: row * GRID.y };
}

// Usage:
const nodes: Node[] = [
  { id: "a", position: gridPos(1, 0), data: { label: "Input" } },
  { id: "b", position: gridPos(0, 1), data: { label: "Process A" } },
  { id: "c", position: gridPos(2, 1), data: { label: "Process B" } },
  { id: "d", position: gridPos(1, 2), data: { label: "Output" } },
];
```

---

## Minimap for Large Graphs

```tsx
import { MiniMap } from "@xyflow/react";

<MiniMap
  nodeColor="var(--scene-accent)"
  maskColor="var(--scene-bg)"
  className="!bg-scene-surface !border-scene-border"
/>
```

A minimap supports exploration; it does not replace readable meeting composition. Split or recompose a crowded graph, and keep any minimap or graph controls away from essential labels and the audience overlay area.
