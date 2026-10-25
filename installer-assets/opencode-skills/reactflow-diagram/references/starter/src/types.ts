export type Evidence = { source: string; locator: string } | { inference: string; decision?: string };
export type NodeKind = 'service' | 'gateway' | 'database' | 'queue' | 'external';
export type Component = { id: string; kind: NodeKind; label: string; description?: string; parent?: string; evidence: Evidence[] };
export type Group = Omit<Component, 'kind'>;
export type Relationship = { id: string; from: string; to: string; label?: string; description?: string; evidence: Evidence[] };
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
export type Measurements = { nodes: Record<string, Size>; headers: Record<string, Size>; labels: Record<string, Size> };
export type PlacedNode = Point & Size & { id: string; parent?: string; kind: NodeKind | 'group'; absX: number; absY: number; headerHeight: number };
export type Route = { id: string; sections: { points: Point[] }[]; label?: Point & Size & { text: string }; sourcePort: Point; targetPort: Point };
/** CompositionMode selects a derived arrangement without changing architectural content. */
export type CompositionMode = 'auto' | 'layered' | 'compact';
/** LayoutOptions preserves the measured two-argument layout API. */
export type LayoutOptions = { composition?: CompositionMode };
/** CompositionCandidate retains bounded comparison evidence at a common reference canvas. */
export type CompositionCandidate = {
  id: string; mode: 'layered' | 'compact'; valid: boolean; bounds: Size;
  fitScale: number; fittedNodeFont: number; fittedLabelFont: number; aspectRatio: number;
  crossings: number; overlaps: number; labelObstructions: number; bends: number; score: number;
  diagnostics: Diagnostic[];
};
/** CompositionEvidence explains the selected arrangement and any rejected alternatives. */
export type CompositionEvidence = {
  requested: CompositionMode; selected: 'layered' | 'compact'; candidate: string;
  candidates: CompositionCandidate[]; reason: string;
};
export type Geometry = { nodes: PlacedNode[]; edges: Route[]; bounds: Size; composition?: CompositionEvidence };
export type Diagnostic = { check: string; ids: string[]; message: string };
export type ValidationEvidence = { model: 'pass' | 'fail'; geometry: 'pass' | 'fail' | 'missing'; rendered: 'pass' | 'fail' | 'missing'; build: 'pass' | 'fail' | 'missing' };
