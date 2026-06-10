import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FlowSceneData } from "../types";

interface FlowSceneProps {
  scene: FlowSceneData;
}

/**
 * React Flow scene wrapper.
 *
 * Features:
 * - Dark-themed graph with custom node styles
 * - Optional highlight steps: click nodes or press Enter to advance
 *   through an ordered sequence of highlighted node groups
 * - Tooltips on node hover (reads `data.tooltip` from node data)
 * - Animated edges between highlighted nodes
 */
export function FlowScene({ scene }: FlowSceneProps) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const hasHighlights = scene.highlightSteps && scene.highlightSteps.length > 0;
  const currentHighlight = hasHighlights
    ? new Set(scene.highlightSteps![highlightIndex] ?? [])
    : new Set<string>();

  const styledNodes: Node[] = useMemo(
    () =>
      scene.nodes.map((node) => ({
        ...node,
        className: currentHighlight.has(node.id) ? "highlighted" : "",
        style: {
          ...node.style,
          opacity: hasHighlights && currentHighlight.size > 0 && !currentHighlight.has(node.id) ? 0.4 : 1,
          transition: "opacity 0.3s ease, border-color 0.3s ease",
        },
      })),
    [scene.nodes, currentHighlight, hasHighlights],
  );

  const styledEdges: Edge[] = useMemo(
    () =>
      scene.edges.map((edge) => ({
        ...edge,
        animated: currentHighlight.has(edge.source) && currentHighlight.has(edge.target),
        style: {
          ...edge.style,
          stroke:
            currentHighlight.has(edge.source) && currentHighlight.has(edge.target)
              ? "#3b82f6"
              : "#64748b",
          strokeWidth: 2,
        },
      })),
    [scene.edges, currentHighlight],
  );

  const advanceHighlight = useCallback(() => {
    if (!hasHighlights) return;
    setHighlightIndex((i) => (i + 1) % scene.highlightSteps!.length);
  }, [hasHighlights, scene.highlightSteps]);

  const onNodeClick: NodeMouseHandler = useCallback(() => {
    advanceHighlight();
  }, [advanceHighlight]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_event, node) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const tooltipNode = scene.nodes.find((n) => n.id === hoveredNode);
  const tooltipText = tooltipNode?.data?.tooltip as string | undefined;

  return (
    <div className="relative w-full h-full">
      {/* Scene title overlay */}
      <div className="absolute top-4 left-4 z-10">
        <h2 className="text-lg font-semibold text-scene-text">{scene.title}</h2>
        {scene.subtitle && (
          <p className="text-sm text-scene-muted mt-0.5">{scene.subtitle}</p>
        )}
      </div>

      {/* Highlight step indicator */}
      {hasHighlights && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <span className="text-xs text-scene-muted font-mono">
            Step {highlightIndex + 1}/{scene.highlightSteps!.length}
          </span>
          <button
            onClick={advanceHighlight}
            className="px-3 py-1 text-xs rounded bg-scene-accent text-white hover:bg-scene-accent-light transition-colors"
          >
            Next step
          </button>
        </div>
      )}

      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-scene-bg"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls
          showInteractive={false}
          className="!bg-scene-surface !border-scene-border !shadow-lg [&>button]:!bg-scene-surface [&>button]:!border-scene-border [&>button]:!text-scene-muted [&>button:hover]:!bg-scene-border"
        />
      </ReactFlow>

      {/* Tooltip */}
      {tooltipText && hoveredNode && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-scene-surface border border-scene-border shadow-xl text-sm text-scene-text max-w-sm animate-fade-in">
          {tooltipText}
        </div>
      )}
    </div>
  );
}
