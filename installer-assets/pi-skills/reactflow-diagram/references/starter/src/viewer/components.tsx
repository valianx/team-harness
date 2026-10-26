import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, Handle, Position, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import type { Component, Endpoint, Group, NodeKind, Relationship, Route } from '../types';

type Kind = NodeKind | 'group';

/** KIND_LABELS names the six visual variants without assigning a group an architectural classification. */
export const KIND_LABELS: Record<Kind, string> = {
  service: 'Service', gateway: 'Gateway', database: 'Database', queue: 'Queue / broker', external: 'External system', group: 'Group',
};

/** Glyph shares the component catalog's symbols with its measurement surface and legend. */
export function Glyph({ kind, size = 20 }: { kind: Kind; size?: number }) {
  const paths: Record<Kind, React.ReactNode> = {
    service: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6v6H9zM12 1v3m0 16v3M1 12h3m16 0h3" /></>,
    gateway: <><path d="m12 3 9 9-9 9-9-9 9-9Z" /><path d="M7 12h10m-4-4 4 4-4 4" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
    queue: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M8 9v6m4-6v6m4-6v6" /></>,
    external: <><path d="M13 3h8v8m0-8L10 14M9 5H4v15h15v-5" /></>,
    group: <><path d="M3 8V4h7l2 3h9v13H3V8Z" /><path d="M3 10h18" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

/** ComponentCard is rendered unchanged in measurement and in the interactive graph. */
export function ComponentCard({ component }: { component: Component }) {
  return <div className={`component-card component-${component.kind}`} data-parent={component.parent}>
    <div className="component-heading"><span className="component-icon" title={KIND_LABELS[component.kind]}><Glyph kind={component.kind} /><span className="sr-only">{KIND_LABELS[component.kind]}</span></span><div className="component-label">{component.label}</div></div>
  </div>;
}

/** GroupHeader has a fixed text width so content measurement does not change after layout. */
export function GroupHeader({ group }: { group: Group }) {
  return <div className="group-header"><span className="group-icon"><Glyph kind="group" size={18} /><span className="sr-only">Group</span></span><div className="group-title">{group.label}</div></div>;
}

/** RelationshipLabel shares font, padding and wrapping between measurement and routed labels. */
export function RelationshipLabel({ label }: { label: string }) {
  return <span className="relationship-label-text">{label}</span>;
}

/** DiagramNodeData carries derived ports and presentation state without changing the source model. */
export type DiagramNodeData = {
  component: Component | Group; kind: Kind;
  sourcePorts: Endpoint[]; targetPorts: Endpoint[]; focused: boolean; dimmed: boolean;
};

/** DiagramNode is the React Flow adapter for one measured component or group. */
export type DiagramNode = Node<DiagramNodeData>;

/** DiagramEdgeData retains all routed sections and the relationship's semantic identity. */
export type DiagramEdgeData = { relationship: Relationship; route: Route; focused: boolean; dimmed: boolean; onSelect: (id: string) => void };

/** DiagramEdge is the React Flow adapter for a derived route. */
export type DiagramEdge = Edge<DiagramEdgeData>;

function NodeHandles({ data }: { data: DiagramNodeData }) {
  const positions = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };
  return <>{(['target', 'source'] as const).flatMap(type => data[`${type}Ports`].map(port => <Handle
    key={port.id} type={type} id={port.id} position={positions[port.side]} data-slot={port.slot}
    className="component-port" style={{ left: port.x, top: port.y, right: 'auto', bottom: 'auto' }} isConnectable={false}
  />))}</>;
}

const ComponentNode = memo(function ComponentNode({ data }: NodeProps<DiagramNode>) {
  return <>
    <ComponentCard component={data.component as Component} />
    <NodeHandles data={data} />
  </>;
});

const GroupNode = memo(function GroupNode({ data }: NodeProps<DiagramNode>) {
  return <><div className="group-frame" data-parent={data.component.parent}><GroupHeader group={data.component} /></div><NodeHandles data={data} /></>;
});

const RoutedEdge = memo(function RoutedEdge({ id, data, markerEnd, selected }: EdgeProps<DiagramEdge>) {
  if (!data) return null;
  const { route, relationship } = data;
  return <>
    {route.sections.map((section, index) => <BaseEdge
      key={index} id={`${id}-section-${index}`}
      path={section.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')}
      markerEnd={index === route.sections.length - 1 ? markerEnd : undefined}
      interactionWidth={20}
      style={{
        stroke: selected || data.focused ? 'var(--accent)' : relationship.interaction ? `var(--interaction-${relationship.interaction})` : 'var(--edge)',
        strokeWidth: selected || data.focused ? 2 : 1.5,
        strokeDasharray: relationship.interaction === 'response' || relationship.interaction === 'event' ? `var(--interaction-${relationship.interaction}-dash)` : undefined,
      }}
    />)}
    {route.label && <EdgeLabelRenderer><button
      type="button" className={`edge-label nodrag nopan${data.focused ? ' is-focused' : ''}${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}`}
      data-relationship={relationship.id}
      aria-label={`Relationship: ${relationship.label ?? relationship.id}`}
      style={{ transform: `translate(${route.label.x}px, ${route.label.y}px)`, width: route.label.width, height: route.label.height }}
      onClick={() => data.onSelect(id)}
    ><RelationshipLabel label={route.label.text} /></button></EdgeLabelRenderer>}
  </>;
});

/** NODE_TYPES maps all six catalog variants onto their shared measured components. */
export const NODE_TYPES = { service: ComponentNode, gateway: ComponentNode, database: ComponentNode, queue: ComponentNode, external: ComponentNode, group: GroupNode };

/** EDGE_TYPES renders the layout engine's sections without substituting curves or inferred bends. */
export const EDGE_TYPES = { routed: RoutedEdge };
