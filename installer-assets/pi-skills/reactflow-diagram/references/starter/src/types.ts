export type Evidence = { source: string; locator: string } | { inference: string; decision?: string };
export type NodeKind = 'service' | 'gateway' | 'database' | 'queue' | 'external';
export type Component = { id: string; kind: NodeKind; label: string; description?: string; parent?: string; evidence: Evidence[] };
export type Group = Omit<Component, 'kind'>;
/** Interaction describes source semantics independently of component colors; omission stays neutral. */
export type Interaction = 'request' | 'call' | 'response' | 'event' | 'persistence';
export type Relationship = { id: string; from: string; to: string; label?: string; description?: string; interaction?: Interaction; evidence: Evidence[] };
export type Source = { id: string; title: string; locator: string; status: 'read' | 'unavailable'; material?: boolean };
export type View = { id: string; label: string; nodeIds: string[]; edgeIds: string[]; outside?: { edge: string; reason: string }[]; continuations?: { edge: string; view: string }[] };
export type Step = { id: string; title: string; description?: string; focus: string[] };
export type Architecture = {
  schemaVersion: 1; title: string; theme: 'presentation'; direction: 'right' | 'down';
  sources: Source[]; nodes: Component[]; groups: Group[]; edges: Relationship[];
  review: { unresolved: string[]; decisions: string[]; assessor?: string };
  views: View[]; steps: Step[];
};
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
/** PortSide identifies the measured component boundary used by a derived endpoint. */
export type PortSide = 'left' | 'right' | 'top' | 'bottom';
/** Endpoint coordinates are in world space; slots reserve a stable position among all component relationships. */
export type Endpoint = Point & { id: string; nodeId: string; side: PortSide; slot: number };
export type Measurements = { nodes: Record<string, Size>; headers: Record<string, Size>; labels: Record<string, Size> };
export type PlacedNode = Point & Size & { id: string; parent?: string; kind: NodeKind | 'group'; absX: number; absY: number; headerHeight: number };
export type Route = { id: string; sections: { points: Point[] }[]; label?: Point & Size & { text: string }; sourcePort: Endpoint; targetPort: Endpoint };
/** RoutingWork records attempted operations and the largest allocated grid, not a time guarantee. */
export type RoutingWork = {
  layeredCalls: number; compactPlacements: number; endpointCandidates: number; labelAlternatives: number;
  searches: number; corridorCandidates: number; expandedStates: number; maxGridStates: number; cappedSearches: number;
};
/** RouteMetric keeps diagram-unit distances and affected relationship IDs for visual assessment. */
export type RouteMetric = { id: string; length: number; directLength: number; detour: number; detourRatio: number; bends: number; crossingIds: string[]; sharedSegmentIds: string[]; obstructedLabelIds: string[] };
/** RoutingEvidence binds bounded attachment exploration and work to the resulting geometry. */
export type RoutingEvidence = { work: RoutingWork; alternatives: { id: string; evaluated: number; rejected: number; sourceSide: PortSide; targetSide: PortSide }[] };
/** CompositionMode selects a derived arrangement without changing architectural content. */
export type CompositionMode = 'auto' | 'layered' | 'compact';
/** LayoutOptions preserves the measured two-argument layout API. */
export type LayoutOptions = { composition?: CompositionMode };
/** CompositionCandidate retains bounded comparison evidence at a common reference canvas. */
export type CompositionCandidate = {
  id: string; mode: 'layered' | 'compact'; duplicateOf?: string; valid: boolean; bounds: Size;
  fitScale: number; fittedNodeFont: number; fittedLabelFont: number; aspectRatio: number;
  crossings: number; overlaps: number; labelObstructions: number; bends: number; score: number;
  routeLength: number; routeDetour: number; maxDetourRatio: number; routes: RouteMetric[];
  elapsedMs: number; work: RoutingWork; diagnostics: Diagnostic[];
};
/** CompositionEvidence explains the selected arrangement and any rejected alternatives. */
export type CompositionEvidence = {
  requested: CompositionMode; selected: 'layered' | 'compact'; candidate: string;
  candidates: CompositionCandidate[]; reason: string;
  execution: { elapsedMs: number; limits: { compositionCandidates: number; sidePairsPerEdge: number; labelAlternativesPerPair: number; searchesPerPair: number; corridorCandidatesPerSearch: number; gridStatesPerSearch: number; expandedStatesPerSearch: number }; work: RoutingWork };
};
export type Geometry = { nodes: PlacedNode[]; edges: Route[]; bounds: Size; routing?: RoutingEvidence; composition?: CompositionEvidence };
export type Diagnostic = { check: string; ids: string[]; message: string };
export type ValidationEvidence = { model: 'pass' | 'fail'; geometry: 'pass' | 'fail' | 'missing'; rendered: 'pass' | 'fail' | 'missing'; build: 'pass' | 'fail' | 'missing' };
