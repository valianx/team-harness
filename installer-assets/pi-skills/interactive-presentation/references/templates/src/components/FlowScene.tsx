import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useReveal } from "@revealjs/react";
import { ReactFlow, Background, Controls, BackgroundVariant, type ReactFlowInstance, type Node as FlowNode, type Edge as FlowEdge } from "@xyflow/react";
import type { FlowSceneData, RegisterSceneControls } from "../types";

/** The graph keeps pointer and keyboard ownership inside the shared content bounds. */
export function FlowScene({ scene, reducedMotion, registerControls }: {
  scene: FlowSceneData;
  reducedMotion: boolean;
  registerControls: RegisterSceneControls;
}) {
  const index = useRef(0);
  const [step, setStep] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const captionId = useId();
  const engine = useReveal();
  const [scale, setScale] = useState(() => engine?.getScale() ?? 1);
  const canvas = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const fitOptions = useMemo(() => ({ padding: 0.2, minZoom: 0.75 * scale, maxZoom: 1.5 * scale }), [scale]);
  const initializeFlow = useCallback((instance: ReactFlowInstance) => setFlow(instance), []);
  const steps = scene.highlightSteps ?? [];
  const highlighted = useMemo(() => new Set(steps[step] ?? []), [steps, step]);
  const move = useCallback((direction: number) => {
    const next = index.current + direction;
    if (next < 0 || next >= steps.length) return false;
    index.current = next;
    setStep(next);
    return true;
  }, [steps.length]);

  useEffect(() => {
    registerControls({
      step,
      totalSteps: steps.length,
      canNext: step < steps.length - 1,
      canPrevious: step > 0,
      next: () => move(1),
      previous: () => move(-1),
    });
  }, [step, steps.length, move, registerControls]);
  useEffect(() => () => registerControls(null), [registerControls]);
  useEffect(() => {
    if (!engine) return;
    const update = () => setScale(engine.getScale());
    engine.on("resize", update);
    update();
    return () => engine.off("resize", update);
  }, [engine]);
  useEffect(() => {
    if (!flow || !canvas.current) return;
    // React Flow's own size observer registers first; refit after actual canvas changes.
    const observer = new ResizeObserver(() => { void flow.fitView(fitOptions); });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [flow, fitOptions]);

  const nodes = useMemo(() => scene.nodes.map((node) => ({
    ...node,
    className: [node.className, highlighted.has(node.id) ? "scene-highlighted" : ""].filter(Boolean).join(" "),
  })), [scene.nodes, highlighted]);
  const edges = useMemo(() => scene.edges.map((edge) => ({
    ...edge,
    animated: !reducedMotion && Boolean(edge.animated),
    className: [edge.className, highlighted.has(edge.source) && highlighted.has(edge.target) ? "scene-edge-highlighted" : ""].filter(Boolean).join(" "),
  })), [scene.edges, highlighted, reducedMotion]);
  const tooltip = scene.nodes.find((node) => node.id === (hoveredNode ?? focusedNode))?.data.tooltip;

  return (
    <div className="flow-scene">
      <div className="graph-stage" role="application" aria-label={`${scene.title} interactive diagram`}
        aria-describedby={captionId}
        tabIndex={0} data-presentation-interactive data-graph-step={step}
        onFocusCapture={(event) => setFocusedNode(event.target instanceof Element
          ? event.target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null : null)}
        onBlurCapture={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocusedNode(null);
        }}
        onPointerOverCapture={(event) => {
          const node = event.nativeEvent.composedPath().find((entry): entry is HTMLElement =>
            entry instanceof HTMLElement && entry.matches(".react-flow__node"));
          setHoveredNode(node?.dataset.id ?? null);
        }}
        onPointerOutCapture={(event) => setHoveredNode(event.relatedTarget instanceof Element
          ? event.relatedTarget.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null : null)}
        onPointerDown={(event) => {
          const owner = event.target instanceof Element ? event.target.closest("button, a, input, [tabindex='0']") : null;
          if (!owner || owner === event.currentTarget) event.currentTarget.focus();
        }}>
        {/* Cancel only Reveal's ancestor scale so native handles and pointer coordinates agree. */}
        <div ref={canvas} className="graph-canvas" style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, transform: `scale(${1 / scale})` }}>
          <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} onInit={initializeFlow} fitView fitViewOptions={fitOptions}
            minZoom={0.5 * scale} maxZoom={2 * scale} nodesDraggable={false} proOptions={{ hideAttribution: true }}>
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--scene-border)" />
            <Controls showInteractive={false} position="bottom-right" fitViewOptions={fitOptions} />
          </ReactFlow>
        </div>
      </div>
      <p id={captionId} className="graph-caption" role="status">{typeof tooltip === "string" ? tooltip : "Use presentation controls for steps. Focus the diagram to pan or zoom."}</p>
    </div>
  );
}
