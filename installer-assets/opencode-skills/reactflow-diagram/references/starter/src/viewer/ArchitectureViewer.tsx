'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Background, BackgroundVariant, getViewportForBounds, MarkerType, ReactFlow, ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import { createLayoutRunner } from '../controller';
import { fidelityStatus, parseModel, selectView } from '../model';
import { TOKENS } from '../tokens';
import type { Architecture, Diagnostic, Geometry, PlacedNode, ValidationEvidence } from '../types';
import { EDGE_TYPES, Glyph, NODE_TYPES, type DiagramEdge, type DiagramNode } from './components';
import { Details } from './Details';
import { MeasurementSurface, measureSurface } from './measurement';

type LayoutState = { phase: 'loading' | 'ready' | 'error'; model?: Architecture; geometry?: Geometry; diagnostics: Diagnostic[]; message?: string };

const theme = {
  '--node-width': `${TOKENS.nodeWidth}px`, '--node-min-height': `${TOKENS.minNodeHeight}px`,
  '--group-inset': `${TOKENS.groupInset}px`, '--port-size': `${TOKENS.portSize}px`,
  '--font-family': TOKENS.fontFamily, '--body-font': `${TOKENS.bodyFont}px`, '--label-font': `${TOKENS.labelFont}px`,
} as CSSProperties;

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={back ? { transform: 'rotate(180deg)' } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

function ValidationStatus({ state, evidence }: { state: LayoutState; evidence?: ValidationEvidence }) {
  const checks = {
    Model: evidence?.model ?? 'pass',
    Geometry: evidence?.geometry === 'fail' || state.diagnostics.length ? 'fail' : state.phase === 'ready' ? 'pass' : 'missing',
    Rendered: evidence?.rendered ?? 'missing', Build: evidence?.build ?? 'missing',
  };
  const complete = Object.values(checks).every(status => status === 'pass');
  return <details className="validation-status" data-testid="validation-status"><summary><span className={`status-dot${complete ? ' complete' : ''}`} />{complete ? 'Mechanical checks passed' : 'Validation incomplete'}<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><div className="validation-popover"><p>Source fidelity is assessed separately.</p><dl>{Object.entries(checks).map(([check, status]) => <div key={check}><dt>{check}</dt><dd className={`check-${status}`}>{status === 'missing' ? 'Not supplied' : status === 'pass' ? 'Passed' : 'Failed'}</dd></div>)}</dl></div></details>;
}

function Viewer({ model, evidence }: { model: Architecture; evidence?: ValidationEvidence }) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const runner = useMemo(() => createLayoutRunner(), []);
  const revision = useRef(0);
  const [viewId, setViewId] = useState(model.views[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState<string>();
  const [stepIndex, setStepIndex] = useState(0);
  const [hostSize, setHostSize] = useState({ width: -1, height: -1 });
  const [canvasSize, setCanvasSize] = useState({ width: -1, height: -1 });
  const [layoutState, setState] = useState<LayoutState>({ phase: 'loading', diagnostics: [] });
  const [flow, setFlow] = useState<ReactFlowInstance<DiagramNode, DiagramEdge>>();
  const [zoom, setZoom] = useState(1);
  const reducedMotion = useReducedMotion();
  const visibleModel = useMemo(() => selectView(model, model.views.some(view => view.id === viewId) ? viewId : undefined), [model, viewId]);
  const state: LayoutState = layoutState.model === visibleModel ? layoutState : { phase: 'loading', diagnostics: [] };
  const fidelity = useMemo(() => fidelityStatus(model), [model]);
  const selectedView = model.views.find(view => view.id === viewId);
  const selected = [...model.nodes, ...model.groups, ...model.edges].find(element => element.id === selectedId);
  const step = visibleModel.steps[stepIndex];
  const usable = hostSize.width > 0 && hostSize.height > 0 && canvasSize.width > 0 && canvasSize.height > 0;

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const size = { width: entry.contentRect.width, height: entry.contentRect.height };
        if (entry.target === root.current) setHostSize(size);
        else setCanvasSize(size);
      }
    });
    observer.observe(root.current!);
    observer.observe(canvas.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setSelectedId(undefined); setStepIndex(0); }, [visibleModel]);

  useEffect(() => {
    const request = ++revision.current;
    if (!usable) return;
    setState({ phase: 'loading', model: visibleModel, diagnostics: [] });
    runner.run(visibleModel, () => measureSurface(surface.current!)).then(result => {
      if (revision.current === request) setState({ phase: 'ready', model: visibleModel, ...result });
    }).catch((error: unknown) => {
      if (revision.current === request) setState({ phase: 'error', model: visibleModel, diagnostics: [], message: error instanceof Error ? error.message : String(error) });
    });
    return () => { ++revision.current; runner.invalidate(); };
  }, [visibleModel, usable, runner]);

  const fitTargets = useCallback((targets: PlacedNode[], padding = 0.15) => {
    if (!flow || !targets.length || !usable) return;
    const x = Math.min(...targets.map(node => node.absX)), y = Math.min(...targets.map(node => node.absY));
    const width = Math.max(...targets.map(node => node.absX + node.width)) - x;
    const height = Math.max(...targets.map(node => node.absY + node.height)) - y;
    const viewport = getViewportForBounds({ x, y, width, height }, canvasSize.width, canvasSize.height, 0.8, 1, padding);
    void flow.setViewport(viewport, { duration: reducedMotion ? 0 : 220 });
  }, [flow, usable, canvasSize.width, canvasSize.height, reducedMotion]);

  const fit = useCallback(() => fitTargets(state.geometry?.nodes ?? []), [fitTargets, state.geometry]);

  const focusedIds = useMemo(() => {
    const ids = new Set(step?.focus ?? []);
    const elements = [...visibleModel.nodes, ...visibleModel.groups];
    for (const edge of visibleModel.edges) if (ids.has(edge.id)) { ids.add(edge.from); ids.add(edge.to); }
    for (const element of elements) {
      if (!ids.has(element.id)) continue;
      let parent = element.parent;
      while (parent) { ids.add(parent); parent = visibleModel.groups.find(group => group.id === parent)?.parent; }
    }
    return ids;
  }, [step, visibleModel]);

  useEffect(() => {
    if (!flow || !state.geometry || !usable) return;
    const frame = requestAnimationFrame(() => {
      let focus = focusedIds;
      if (selectedId) {
        const relationship = visibleModel.edges.find(edge => edge.id === selectedId);
        focus = new Set(relationship ? [relationship.from, relationship.to] : [selectedId]);
      }
      const leaves = state.geometry!.nodes.filter(node => node.kind !== 'group' && focus.has(node.id));
      const targets = leaves.length ? leaves : state.geometry!.nodes.filter(node => focus.has(node.id));
      fitTargets(targets.length ? targets : state.geometry!.nodes, 0.2);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedIds, selectedId, visibleModel, state.geometry, flow, usable, fitTargets]);

  const extendsCanvas = !!state.geometry && (state.geometry.bounds.width * zoom > canvasSize.width || state.geometry.bounds.height * zoom > canvasSize.height);

  const nodes: DiagramNode[] = useMemo(() => state.geometry?.nodes.map(placed => {
    const component = [...visibleModel.nodes, ...visibleModel.groups].find(element => element.id === placed.id)!;
    const source = state.geometry!.edges.find(edge => visibleModel.edges.find(item => item.id === edge.id)?.from === placed.id)?.sourcePort;
    const target = state.geometry!.edges.find(edge => visibleModel.edges.find(item => item.id === edge.id)?.to === placed.id)?.targetPort;
    const local = (point?: { x: number; y: number }) => point ? { x: point.x - placed.absX, y: point.y - placed.absY } : undefined;
    const focused = focusedIds.has(placed.id);
    return {
      id: placed.id, type: placed.kind, parentId: placed.parent, position: { x: placed.x, y: placed.y },
      width: placed.width, height: placed.height, style: { width: placed.width, height: placed.height },
      // Retain initialized handle bounds when focus or selection rebuilds controlled nodes.
      measured: { width: placed.width, height: placed.height },
      className: `${focused ? 'is-focused' : ''}${step && !focused ? ' is-dimmed' : ''}`,
      data: { component, kind: placed.kind, direction: visibleModel.direction, sourcePort: local(source), targetPort: local(target), focused, dimmed: !!step && !focused },
      selected: placed.id === selectedId, selectable: true, draggable: false, connectable: false,
      ariaLabel: `${placed.kind === 'group' ? 'Group' : 'Component'}: ${component.label}`, ariaRole: 'button',
    };
  }) ?? [], [state.geometry, visibleModel, focusedIds, step, selectedId]);

  const edges: DiagramEdge[] = useMemo(() => state.geometry?.edges.map(route => {
    const relationship = visibleModel.edges.find(edge => edge.id === route.id)!;
    const focused = focusedIds.has(route.id);
    return { id: route.id, type: 'routed', source: relationship.from, target: relationship.to, sourceHandle: 'out', targetHandle: 'in',
      data: { relationship, route, focused, dimmed: !!step && !focused, onSelect: setSelectedId },
      className: `${focused ? 'is-focused' : ''}${step && !focused ? ' is-dimmed' : ''}`,
      selected: route.id === selectedId, selectable: true, focusable: true, ariaRole: 'button',
      ariaLabel: `Relationship: ${relationship.label ?? relationship.id}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: focused || route.id === selectedId ? '#78c9b4' : '#85938f', width: 14, height: 14 },
    };
  }) ?? [], [state.geometry, visibleModel, focusedIds, step, selectedId]);

  const closeDetails = useCallback(() => {
    const id = selectedId;
    setSelectedId(undefined);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id ?? '')}"]`)?.focus());
  }, [selectedId]);

  function keyboardSelect(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && selectedId) { event.preventDefault(); closeDetails(); return; }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as Element;
    const element = target.closest('.react-flow__node, .react-flow__edge');
    if (element) { event.preventDefault(); setSelectedId(element.getAttribute('data-id')!); }
  }

  return <section ref={root} className={`architecture-viewer${reducedMotion ? ' reduce-motion' : ''}${!usable && hostSize.width >= 0 ? ' is-unusable' : ''}`} aria-label={`${model.title} architecture viewer`} style={theme} onKeyDownCapture={keyboardSelect}>
    <header className="viewer-toolbar">
      <div className="diagram-title"><span className="eyebrow">Architecture / interactive view</span><h1>{model.title}</h1></div>
      <div className="toolbar-controls"><label className="perspective-label"><span className="sr-only">Perspective</span><select aria-label="Perspective" value={viewId} onChange={event => setViewId(event.target.value)}><option value="">Complete architecture</option>{model.views.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}</select></label>
      <button type="button" className="secondary-button fit-button" onClick={fit} disabled={!state.geometry} aria-label="Fit diagram"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" /></svg><span>Fit view</span></button>
      <span className={`fidelity-status ${fidelity.status}`} data-testid="fidelity-status"><span className="status-dot" />{fidelity.status === 'draft' ? 'Draft' : 'Source reviewed'}</span></div>
    </header>

    {fidelity.status === 'draft' && <details className="review-notes" data-testid="review-notes"><summary><span className="review-symbol">!</span>{fidelity.reasons.length} source {fidelity.reasons.length === 1 ? 'question' : 'questions'} to resolve<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><ul>{fidelity.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}

    <div className={`viewer-workarea${selected ? ' has-details' : ''}`}>
      <div ref={canvas} className="diagram-canvas" data-testid="diagram-canvas" data-layout-state={state.phase}>
        {!usable && hostSize.width >= 0 && <div className="viewer-size-alert" role="alert"><strong>Give the viewer a width and height.</strong><p>Set an explicit height on its host container, for example <code>height: 650px</code>, and allow it to fill the available width.</p></div>}
        {usable && state.phase === 'loading' && <div className="canvas-state" role="status"><div className="loading-mark"><Glyph kind="service" size={28} /></div><h2>Preparing your architecture</h2><p>Loading local fonts, measuring components and routing connections.</p></div>}
        {usable && state.phase === 'error' && <div className="canvas-state error-state" role="alert"><span className="state-symbol">!</span><h2>Layout needs attention</h2><p>{state.message}</p><p className="state-help">Share this diagnostic with your agent to correct the model or its supported layout.</p></div>}
        {usable && state.phase === 'ready' && !nodes.length && <div className="canvas-state"><Glyph kind="group" size={32} /><h2>No components in this perspective</h2><p>Choose another perspective or ask your agent to add the missing architecture.</p></div>}
        {usable && state.phase === 'ready' && !!nodes.length && <>
          <div className="canvas-context"><span className="canvas-context-dot" /><span>{selectedView?.label ?? 'Complete architecture'}</span><span className="canvas-count">{visibleModel.nodes.length} components · {visibleModel.edges.length} relationships</span></div>
          {extendsCanvas && <p className="canvas-limit" data-testid="canvas-limit" role="status">This view extends beyond the canvas.<br />Pan or choose a perspective.</p>}
          <ReactFlow<DiagramNode, DiagramEdge> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            onInit={setFlow} onNodeClick={(_, node) => setSelectedId(node.id)} onEdgeClick={(_, edge) => setSelectedId(edge.id)} onPaneClick={() => setSelectedId(undefined)}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} minZoom={0.15} maxZoom={1.8} colorMode="dark"
            autoPanOnNodeFocus onMove={(_, viewport) => setZoom(viewport.zoom)}
            elevateNodesOnSelect={false} elevateEdgesOnSelect={false} proOptions={{ hideAttribution: false }}
            aria-label="Interactive architecture diagram">
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#343d3e" />
          </ReactFlow>
          <div className="canvas-legend" aria-label="Component legend">{(['service', 'gateway', 'database', 'queue', 'external'] as const).filter(kind => visibleModel.nodes.some(node => node.kind === kind)).map(kind => <span key={kind}><Glyph kind={kind} size={13} />{kind === 'queue' ? 'Queue' : kind.charAt(0).toUpperCase() + kind.slice(1)}</span>)}</div>
          <div className="canvas-navigation"><button type="button" className="icon-button" onClick={() => void flow?.zoomOut({ duration: reducedMotion ? 0 : 150 })} aria-label="Zoom out">−</button><output aria-label="Zoom level">{Math.round(zoom * 100)}%</output><button type="button" className="icon-button" onClick={() => void flow?.zoomIn({ duration: reducedMotion ? 0 : 150 })} aria-label="Zoom in">+</button></div>
        </>}
      </div>
      {selected && <Details model={model} selection={selected} onClose={closeDetails} />}
    </div>

    {state.diagnostics.length > 0 && <details className="geometry-diagnostics" open><summary>Geometry checks need attention · {state.diagnostics.length}</summary><ul>{state.diagnostics.map((diagnostic, index) => <li key={index}><strong>{diagnostic.check}</strong> · {diagnostic.ids.join(', ')}<p>{diagnostic.message}</p></li>)}</ul></details>}

    <footer className="viewer-footer">
      <nav className="presentation-steps" aria-label="Presentation steps"><button type="button" className="icon-button step-button" aria-label="Previous step" disabled={stepIndex === 0 || !step} onClick={() => setStepIndex(index => index - 1)}><Arrow back /></button>
        <div className="step-narrative" data-testid="step-narrative" aria-live="polite">{step ? <><span className="step-index">{String(stepIndex + 1).padStart(2, '0')}<span> / {String(visibleModel.steps.length).padStart(2, '0')}</span></span><div><strong>{step.title}</strong>{step.description && <p>{step.description}</p>}</div></> : <span className="no-steps">Explore the components and their evidence</span>}</div>
        <button type="button" className="icon-button step-button" aria-label="Next step" disabled={!step || stepIndex >= visibleModel.steps.length - 1} onClick={() => setStepIndex(index => index + 1)}><Arrow /></button>
      </nav>
      <ValidationStatus state={state} evidence={evidence} />
    </footer>
    {selectedView && <div className="view-context" data-testid="view-context"><span className="eyebrow">Perspective context</span><span>{selectedView.outside?.length ? `${selectedView.outside.length} relationships declared outside this perspective.` : 'All included relationships retain their endpoints.'}</span>{selectedView.outside?.map(outside => <span key={outside.edge}>{model.edges.find(edge => edge.id === outside.edge)?.label ?? outside.edge}: {outside.reason}</span>)}{selectedView.continuations?.map(continuation => <button type="button" key={`${continuation.edge}-${continuation.view}`} onClick={() => setViewId(continuation.view)}>Continue {model.edges.find(edge => edge.id === continuation.edge)?.label ?? continuation.edge} in {model.views.find(view => view.id === continuation.view)?.label ?? continuation.view} <Arrow /></button>)}</div>}
    <MeasurementSurface key={viewId} ref={surface} model={visibleModel} />
  </section>;
}

/** ArchitectureViewerProps accepts editable architecture input and separately supplied validation evidence. */
export type ArchitectureViewerProps = { model: unknown; evidence?: ValidationEvidence };

/** ArchitectureViewer validates a versioned model and owns bounded, replaceable layout generations. */
export function ArchitectureViewer({ model, evidence }: ArchitectureViewerProps) {
  const parsed = useMemo(() => {
    try { return { model: parseModel(model) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [model]);
  if (!parsed.model) return <section className="architecture-viewer invalid-viewer" style={theme} role="alert"><span className="eyebrow">Architecture / model diagnostic</span><h1>Model could not be read</h1><pre>{parsed.error}</pre><p>Ask your agent to correct the indicated model fields before layout.</p></section>;
  return <ReactFlowProvider><Viewer model={parsed.model} evidence={evidence} /></ReactFlowProvider>;
}
