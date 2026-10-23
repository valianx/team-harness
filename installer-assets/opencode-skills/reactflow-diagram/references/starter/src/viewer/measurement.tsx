import { forwardRef } from 'react';
import type { Architecture, Measurements, Size } from '../types';
import { TOKENS } from '../tokens';
import { ComponentCard, GroupHeader, RelationshipLabel } from './components';

/** MeasurementSurface keeps real catalog DOM measurable while excluding it from interaction. */
export const MeasurementSurface = forwardRef<HTMLDivElement, { model: Architecture }>(function MeasurementSurface({ model }, ref) {
  return <div ref={ref} className="measurement-surface" aria-hidden="true">
    {model.nodes.map(component => <div key={component.id} data-measure-node={component.id}><ComponentCard component={component} /></div>)}
    {model.groups.map(group => <div key={group.id} data-measure-header={group.id}><GroupHeader group={group} /></div>)}
    {model.edges.filter(edge => edge.label).map(edge => <span key={edge.id} className="edge-label measured-edge-label" data-measure-label={edge.id}><RelationshipLabel label={edge.label!} /></span>)}
    <span className="component-port measured-port" data-measure-port />
  </div>;
});

function size(element: Element): Size {
  const bounds = element.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) throw new Error(`Measurement has no usable size: ${element.getAttribute('data-measure-node') ?? element.getAttribute('data-measure-header') ?? element.getAttribute('data-measure-label') ?? 'port'}`);
  return { width: bounds.width, height: bounds.height };
}

/** measureSurface waits for local fonts, then reads unscaled catalog and label bounds from the DOM. */
export async function measureSurface(surface: HTMLDivElement): Promise<Measurements> {
  const fonts = await Promise.all([400, 500, 600].map(weight => document.fonts.load(`${weight} ${TOKENS.bodyFont}px "${TOKENS.fontFamily}"`)));
  if (fonts.some(loaded => !loaded.length)) throw new Error('Local Inter fonts are missing. Import the kit font styles before mounting the viewer.');
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  if (!surface.isConnected) throw new Error('Measurement surface was replaced.');
  const collect = (attribute: string, child?: string): Record<string, Size> => Object.fromEntries(
    Array.from(surface.querySelectorAll(`[${attribute}]`), element => [element.getAttribute(attribute)!, size(child ? element.querySelector(child)! : element)]),
  );
  const port = size(surface.querySelector('[data-measure-port]')!);
  if (Math.abs(port.width - TOKENS.portSize) > TOKENS.tolerance || Math.abs(port.height - TOKENS.portSize) > TOKENS.tolerance) throw new Error('Rendered port dimensions do not match the shared layout tokens.');
  return { nodes: collect('data-measure-node', '.component-card'), headers: collect('data-measure-header', '.group-header'), labels: collect('data-measure-label') };
}
