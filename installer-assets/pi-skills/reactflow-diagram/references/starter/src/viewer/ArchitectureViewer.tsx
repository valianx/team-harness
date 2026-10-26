'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Background, BackgroundVariant, getViewportForBounds, MarkerType, ReactFlow, ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import { createLayoutRunner } from '../controller';
import { layout } from '../layout';
import { contentBounds } from '../composition';
import { fidelityStatus, parseModel, selectView } from '../model';
import { TOKENS } from '../tokens';
import type { Architecture, CompositionMode, Diagnostic, Endpoint, Geometry, PlacedNode, ValidationEvidence } from '../types';
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

function ValidationStatus({ state, evidence, flowRequired }: { state: LayoutState; evidence?: ValidationEvidence; flowRequired: boolean }) {
  const flowAssessment = state.phase === 'ready' ? state.geometry?.composition?.flow : undefined;
  const checks = {
    Model: evidence?.model ?? 'pass',
    Geometry: evidence?.geometry === 'fail' || state.diagnostics.length ? 'fail' : state.phase === 'ready' ? 'pass' : 'missing',
    Rendered: evidence?.rendered ?? 'missing', Build: evidence?.build ?? 'missing',
    ...(flowRequired ? { 'Flow composition': flowAssessment?.status === 'satisfied' ? 'pass' : flowAssessment ? 'fail' : 'missing' } : {}),
  };
  const complete = Object.values(checks).every(status => status === 'pass');
  return <details className="validation-status" data-testid="validation-status"><summary><span className={`status-dot${complete ? ' complete' : ''}`} />{complete ? flowRequired ? 'Mechanical and flow checks passed' : 'Mechanical checks passed' : 'Validation incomplete'}<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><div className="validation-popover"><p>Source fidelity and visual judgment are assessed separately.</p><dl>{Object.entries(checks).map(([check, status]) => <div key={check}><dt>{check}</dt><dd className={`check-${status}`}>{status === 'missing' ? 'Not supplied' : status === 'pass' ? 'Passed' : 'Failed'}</dd></div>)}</dl></div></details>;
}

function Viewer({ model, inputIdentity, evidence, composition }: { model: Architecture; inputIdentity: string; evidence?: ValidationEvidence; composition: CompositionMode }) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const runner = useMemo(() => createLayoutRunner({ layout: (model, sizes) => layout(model, sizes, { composition }) }), [composition]);
  const revision = useRef(0);
  const [viewId, setViewId] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [selectionFocused, setSelectionFocused] = useState(false);
  const selectElement = useCallback((id: string) => { setSelectedId(id); setSelectionFocused(true); }, []);
  const [stepIndex, setStepIndex] = useState(-1);
  const [hostSize, setHostSize] = useState({ width: -1, height: -1 });
  const [canvasSize, setCanvasSize] = useState({ width: -1, height: -1 });
  const [layoutState, setState] = useState<LayoutState>({ phase: 'loading', diagnostics: [] });
  const [flow, setFlow] = useState<ReactFlowInstance<DiagramNode, DiagramEdge>>();
  const [zoom, setZoom] = useState(1);
  const [pointerRegion, setPointerRegion] = useState<'top' | 'bottom'>();
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const reducedMotion = useReducedMotion();
  const visibleModel = useMemo(() => selectView(model, model.views.some(view => view.id === viewId) ? viewId : undefined), [model, viewId]);
  const state: LayoutState = layoutState.model === visibleModel ? layoutState : { phase: 'loading', diagnostics: [] };
  const flowAssessment = state.geometry?.composition?.flow;
  const flowDiagnostics: Diagnostic[] = visibleModel.flow && state.phase === 'ready' && flowAssessment?.status !== 'satisfied'
    ? flowAssessment?.diagnostics.length ? flowAssessment.diagnostics : [{ check: flowAssessment ? 'flow-unsatisfied' : 'flow-unavailable', ids: visibleModel.flow.primary,
      message: flowAssessment ? 'The selected composition does not satisfy the declared flow.' : 'Declared flow intent has no current selected composition assessment.' }]
    : [];
  const fidelity = useMemo(() => fidelityStatus(model), [model]);
  const selectedView = model.views.find(view => view.id === viewId);
  const selected = [...model.nodes, ...model.groups, ...model.edges].find(element => element.id === selectedId);
  const step = visibleModel.steps[stepIndex];
  const usable = hostSize.width > 0 && hostSize.height > 0 && canvasSize.width > 0 && canvasSize.height > 0;

  useEffect(() => {
    setFullscreenAvailable(document.fullscreenEnabled === true);
    const update = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  function trackControlRegion(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - box.top;
    const owner = (event.target as Element).closest('.viewer-chrome-top, .viewer-chrome-bottom');
    const x = event.clientX, pointerY = event.clientY;
    const retained = [...event.currentTarget.querySelectorAll('.viewer-chrome-top, .viewer-chrome-bottom')].filter(region => {
      const bounds = region.getBoundingClientRect();
      return x >= bounds.left && x <= bounds.right && pointerY >= bounds.top && pointerY <= bounds.bottom;
    }).map(region => region.classList.contains('viewer-chrome-top') ? 'top' : 'bottom');
    const activated = y < 24 ? 'top' : y >= box.height - 24 ? 'bottom' : owner ? owner.classList.contains('viewer-chrome-top') ? 'top' : 'bottom' : undefined;
    setPointerRegion(current => activated ?? (current && retained.includes(current) ? current : undefined));
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
      setFullscreenError('');
    } catch {
      setFullscreenError('Fullscreen is unavailable in this browser.');
    }
  }

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

  useEffect(() => { setSelectedId(undefined); setStepIndex(-1); setSelectionFocused(false); }, [visibleModel]);

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

  const fitTargets = useCallback((targets: PlacedNode[]) => {
    if (!flow || !targets.length || !usable) return;
    const ids = new Set(targets.map(node => node.id));
    const relationships = new Set(visibleModel.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)).map(edge => edge.id));
    const routes = state.geometry?.edges.filter(edge => relationships.has(edge.id)) ?? [];
    const points = [
      ...targets.flatMap(node => [{ x: node.absX, y: node.absY }, { x: node.absX + node.width, y: node.absY + node.height }]),
      ...routes.flatMap(edge => [...edge.sections.flatMap(section => section.points), ...(edge.label ? [{ x: edge.label.x, y: edge.label.y }, { x: edge.label.x + edge.label.width, y: edge.label.y + edge.label.height }] : [])]),
    ];
    const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
    const width = Math.max(...points.map(point => point.x)) - x;
    const height = Math.max(...points.map(point => point.y)) - y;
    const viewport = getViewportForBounds({ x, y, width, height }, canvasSize.width * 0.9, canvasSize.height * 0.9, 0.15, 1.8, 0);
    void flow.setViewport({ ...viewport, x: viewport.x + canvasSize.width * 0.05, y: viewport.y + canvasSize.height * 0.05 }, { duration: reducedMotion ? 0 : 220 });
  }, [flow, usable, canvasSize.width, canvasSize.height, reducedMotion, state.geometry, visibleModel.edges]);

  const fit = useCallback(() => {
    setStepIndex(-1);
    setSelectionFocused(false);
    fitTargets(state.geometry?.nodes ?? []);
  }, [fitTargets, state.geometry]);

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
      if (selectedId && selectionFocused) {
        const relationship = visibleModel.edges.find(edge => edge.id === selectedId);
        focus = new Set(relationship ? [relationship.from, relationship.to] : [selectedId]);
      }
      const leaves = state.geometry!.nodes.filter(node => node.kind !== 'group' && focus.has(node.id));
      const targets = leaves.length ? leaves : state.geometry!.nodes.filter(node => focus.has(node.id));
      fitTargets(targets.length ? targets : state.geometry!.nodes);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedIds, selectedId, selectionFocused, visibleModel, state.geometry, flow, usable, fitTargets]);

  const content = state.geometry ? contentBounds(state.geometry) : undefined;
  const extendsCanvas = !!content && (content.width * zoom > canvasSize.width + TOKENS.tolerance || content.height * zoom > canvasSize.height + TOKENS.tolerance);

  const nodes: DiagramNode[] = useMemo(() => state.geometry?.nodes.map(placed => {
    const component = [...visibleModel.nodes, ...visibleModel.groups].find(element => element.id === placed.id)!;
    const local = (point: Endpoint) => ({ ...point, x: point.x - placed.absX, y: point.y - placed.absY });
    const sourcePorts = state.geometry!.edges.filter(edge => edge.sourcePort.nodeId === placed.id).map(edge => local(edge.sourcePort));
    const targetPorts = state.geometry!.edges.filter(edge => edge.targetPort.nodeId === placed.id).map(edge => local(edge.targetPort));
    const focused = focusedIds.has(placed.id);
    return {
      id: placed.id, type: placed.kind, parentId: placed.parent, position: { x: placed.x, y: placed.y },
      width: placed.width, height: placed.height, style: { width: placed.width, height: placed.height },
      // Retain initialized handle bounds when focus or selection rebuilds controlled nodes.
      measured: { width: placed.width, height: placed.height },
      className: `${focused ? 'is-focused' : ''}${step && !focused ? ' is-dimmed' : ''}`,
      data: { component, kind: placed.kind, sourcePorts, targetPorts, focused, dimmed: !!step && !focused },
      selected: placed.id === selectedId, selectable: true, draggable: false, connectable: false,
      ariaLabel: `${placed.kind === 'group' ? 'Group' : 'Component'}: ${component.label}`, ariaRole: 'button',
    };
  }) ?? [], [state.geometry, visibleModel, focusedIds, step, selectedId]);

  const edges: DiagramEdge[] = useMemo(() => state.geometry?.edges.map(route => {
    const relationship = visibleModel.edges.find(edge => edge.id === route.id)!;
    const focused = focusedIds.has(route.id);
    return { id: route.id, type: 'routed', source: relationship.from, target: relationship.to, sourceHandle: route.sourcePort.id, targetHandle: route.targetPort.id,
      data: { relationship, route, focused, dimmed: !!step && !focused, onSelect: selectElement },
      className: `${focused ? 'is-focused' : ''}${step && !focused ? ' is-dimmed' : ''}`,
      selected: route.id === selectedId, selectable: true, focusable: true, ariaRole: 'button',
      ariaLabel: `Relationship: ${relationship.label ?? relationship.id}`,
      markerEnd: { type: MarkerType.Arrow, color: focused || route.id === selectedId ? 'var(--accent)' : relationship.interaction ? `var(--interaction-${relationship.interaction})` : 'var(--edge)', markerUnits: 'userSpaceOnUse', width: 36 / zoom, height: 36 / zoom },
    };
  }) ?? [], [state.geometry, visibleModel, focusedIds, step, selectedId, selectElement, zoom]);

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
    if (element) { event.preventDefault(); selectElement(element.getAttribute('data-id')!); }
  }

  return <section ref={root} className={`architecture-viewer${reducedMotion ? ' reduce-motion' : ''}${!usable && hostSize.width >= 0 ? ' is-unusable' : ''}`} aria-label={`${model.title} architecture viewer`} style={theme} onKeyDownCapture={keyboardSelect}
    data-model-content={inputIdentity} data-pointer-region={pointerRegion}>
    {fidelity.status === 'draft' && <details className="review-notes" data-testid="review-notes"><summary><span className="review-symbol">!</span>{fidelity.reasons.length} source {fidelity.reasons.length === 1 ? 'question' : 'questions'} to resolve<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><ul>{fidelity.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}

    <div className={`viewer-workarea${selected ? ' has-details' : ''}`}>
      <div ref={canvas} className="diagram-canvas" data-testid="diagram-canvas" data-layout-state={state.phase}
        onPointerMoveCapture={trackControlRegion} onPointerLeave={() => setPointerRegion(undefined)}
        data-layout-diagnostics={JSON.stringify(state.diagnostics)} data-composition-selected={state.geometry?.composition?.selected}
        data-composition-report={state.geometry?.composition ? JSON.stringify(state.geometry.composition) : undefined}>
        <div className="viewer-chrome-top">
          <header className="viewer-toolbar">
            <div className="diagram-title"><span className="eyebrow">Architecture / interactive view</span><h1>{model.title}</h1></div>
            <div className="toolbar-controls"><label className="perspective-label"><span className="sr-only">Perspective</span><select aria-label="Perspective" value={viewId} onChange={event => setViewId(event.target.value)}><option value="">Complete architecture</option>{model.views.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}</select></label>
            <button type="button" className="secondary-button fit-button" onClick={fit} disabled={!state.geometry} aria-label="Fit diagram"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" /></svg><span>Fit view</span></button>
            <button type="button" className="secondary-button fullscreen-button" onClick={() => void toggleFullscreen()} disabled={!fullscreenAvailable} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d={fullscreen ? 'M3 7h4V3m6 0v4h4M3 13h4v4m6 0v-4h4' : 'M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4'} /></svg></button>
            <span className={`fidelity-status ${fidelity.status}`} data-testid="fidelity-status"><span className="status-dot" />{fidelity.status === 'draft' ? 'Draft' : 'Source reviewed'}</span></div>
          </header>
          {usable && state.phase === 'ready' && !!nodes.length && <div className="canvas-context"><span className="canvas-context-dot" /><span>{selectedView?.label ?? 'Complete architecture'}</span><span className="canvas-count">{visibleModel.nodes.length} components · {visibleModel.edges.length} relationships</span></div>}
          {extendsCanvas && <p className="canvas-limit" data-testid="canvas-limit" role="status">This view extends beyond the canvas.<br />Pan or choose a perspective.</p>}
        </div>
        {fullscreenError && <p className="fullscreen-error" role="status">{fullscreenError}</p>}
        {!usable && hostSize.width >= 0 && <div className="viewer-size-alert" role="alert"><strong>Give the viewer a width and height.</strong><p>Set an explicit height on its host container, for example <code>height: 650px</code>, and allow it to fill the available width.</p></div>}
        {usable && state.phase === 'loading' && <div className="canvas-state" role="status"><div className="loading-mark"><Glyph kind="service" size={28} /></div><h2>Preparing your architecture</h2><p>Loading local fonts, measuring components and routing connections.</p></div>}
        {usable && state.phase === 'error' && <div className="canvas-state error-state" role="alert"><span className="state-symbol">!</span><h2>Layout needs attention</h2><p>{state.message}</p><p className="state-help">Share this diagnostic with your agent to correct the model or its supported layout.</p></div>}
        {usable && state.phase === 'ready' && !nodes.length && <div className="canvas-state"><Glyph kind="group" size={32} /><h2>No components in this perspective</h2><p>Choose another perspective or ask your agent to add the missing architecture.</p></div>}
        {usable && state.phase === 'ready' && !!nodes.length && <>
          <ReactFlow<DiagramNode, DiagramEdge> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            onInit={setFlow} onNodeClick={(_, node) => selectElement(node.id)} onEdgeClick={(_, edge) => selectElement(edge.id)} onPaneClick={() => setSelectedId(undefined)}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} minZoom={0.15} maxZoom={1.8} colorMode="dark"
            autoPanOnNodeFocus onMove={(_, viewport) => setZoom(viewport.zoom)}
            elevateNodesOnSelect={false} elevateEdgesOnSelect={false} proOptions={{ hideAttribution: false }}
            aria-label="Interactive architecture diagram">
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#343d3e" />
          </ReactFlow>
        </>}
        <div className="viewer-chrome-bottom">
          {usable && state.phase === 'ready' && !!nodes.length && <div className="viewer-chrome-aux">
            <div className="canvas-legend" aria-label="Component legend">{(['service', 'gateway', 'database', 'queue', 'external'] as const).filter(kind => visibleModel.nodes.some(node => node.kind === kind)).map(kind => <span key={kind}><Glyph kind={kind} size={13} />{kind === 'queue' ? 'Queue' : kind.charAt(0).toUpperCase() + kind.slice(1)}</span>)}</div>
            <div className="canvas-navigation"><button type="button" className="icon-button" onClick={() => void flow?.zoomOut({ duration: reducedMotion ? 0 : 150 })} aria-label="Zoom out">−</button><output aria-label="Zoom level">{Math.round(zoom * 100)}%</output><button type="button" className="icon-button" onClick={() => void flow?.zoomIn({ duration: reducedMotion ? 0 : 150 })} aria-label="Zoom in">+</button></div>
          </div>}
          <footer className="viewer-footer">
            <nav className="presentation-steps" aria-label="Presentation steps"><button type="button" className="icon-button step-button" aria-label="Previous step" disabled={stepIndex < 0} onClick={() => { setSelectionFocused(false); setStepIndex(index => index - 1); }}><Arrow back /></button>
              <div className="step-narrative" data-testid="step-narrative" aria-live="polite">{step ? <><span className="step-index">{String(stepIndex + 1).padStart(2, '0')}<span> / {String(visibleModel.steps.length).padStart(2, '0')}</span></span><div><strong>{step.title}</strong>{step.description && <p>{step.description}</p>}</div></> : <span className="no-steps">Explore the components and their evidence</span>}</div>
              <button type="button" className="icon-button step-button" aria-label="Next step" disabled={!visibleModel.steps.length || stepIndex >= visibleModel.steps.length - 1} onClick={() => { setSelectionFocused(false); setStepIndex(index => index + 1); }}><Arrow /></button>
            </nav>
            <ValidationStatus state={state} evidence={evidence} flowRequired={!!visibleModel.flow} />
          </footer>
          {selectedView && <div className="view-context" data-testid="view-context"><span className="eyebrow">Perspective context</span><span>{selectedView.outside?.length ? `${selectedView.outside.length} relationships declared outside this perspective.` : 'All included relationships retain their endpoints.'}</span>{selectedView.outside?.map(outside => <span key={outside.edge}>{model.edges.find(edge => edge.id === outside.edge)?.label ?? outside.edge}: {outside.reason}</span>)}{selectedView.continuations?.map(continuation => <button type="button" key={`${continuation.edge}-${continuation.view}`} onClick={() => setViewId(continuation.view)}>Continue {model.edges.find(edge => edge.id === continuation.edge)?.label ?? continuation.edge} in {model.views.find(view => view.id === continuation.view)?.label ?? continuation.view} <Arrow /></button>)}</div>}
        </div>
      </div>
      {selected && <Details model={model} selection={selected} onClose={closeDetails} />}
    </div>

    {state.diagnostics.length > 0 && <details className="geometry-diagnostics" open><summary>Geometry checks need attention · {state.diagnostics.length}</summary><ul>{state.diagnostics.map((diagnostic, index) => <li key={index}><strong>{diagnostic.check}</strong> · {diagnostic.ids.join(', ')}<p>{diagnostic.message}</p></li>)}</ul></details>}
    {flowDiagnostics.length > 0 && <details className="geometry-diagnostics" data-testid="flow-diagnostics" open><summary>Flow composition needs attention · {flowDiagnostics.length}</summary><ul>{flowDiagnostics.map((diagnostic, index) => <li key={index}><strong>{diagnostic.check}</strong> · {diagnostic.ids.join(', ')}<p>{diagnostic.message}</p></li>)}</ul></details>}

    <MeasurementSurface key={viewId} ref={surface} model={visibleModel} />
  </section>;
}

/** ArchitectureViewerProps accepts editable architecture input and separately supplied validation evidence. */
export type ArchitectureViewerProps = { model: unknown; evidence?: ValidationEvidence; composition?: CompositionMode };

/** ArchitectureViewer validates a versioned model and owns bounded, replaceable layout generations. */
export function ArchitectureViewer({ model, evidence, composition = 'auto' }: ArchitectureViewerProps) {
  const parsed = useMemo(() => {
    try { return { model: parseModel(model) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [model]);
  if (!parsed.model) return <section className="architecture-viewer invalid-viewer" style={theme} role="alert"><span className="eyebrow">Architecture / model diagnostic</span><h1>Model could not be read</h1><pre>{parsed.error}</pre><p>Ask your agent to correct the indicated model fields before layout.</p></section>;
  return <ReactFlowProvider><Viewer model={parsed.model} inputIdentity={JSON.stringify(model)} evidence={evidence} composition={composition} /></ReactFlowProvider>;
}
