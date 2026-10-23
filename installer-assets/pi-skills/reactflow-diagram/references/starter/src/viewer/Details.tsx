import { useId } from 'react';
import type { Architecture, Component, Evidence, Group, Relationship } from '../types';
import { Glyph, KIND_LABELS } from './components';

function EvidenceItem({ evidence, model }: { evidence: Evidence; model: Architecture }) {
  if ('inference' in evidence) return <li className="evidence-item inference"><span className="evidence-type">Inference</span><p>{evidence.inference}</p><span className="evidence-locator">{evidence.decision ? `Decision: ${evidence.decision}` : 'Decision not recorded'}</span></li>;
  const source = model.sources.find(source => source.id === evidence.source);
  return <li className="evidence-item"><span className="evidence-type">Source · {source?.status === 'read' ? 'Read' : 'Unavailable'}</span><p>{source?.title ?? evidence.source}</p><span className="evidence-locator">{evidence.locator}</span>{source?.locator && source.locator !== evidence.locator && <span className="source-origin">{source.locator}</span>}</li>;
}

/** Details presents model evidence as readable locators without fetching source material. */
export function Details({ model, selection, onClose }: { model: Architecture; selection: Component | Group | Relationship; onClose: () => void }) {
  const evidenceHeading = useId();
  const relationship = 'from' in selection;
  const kind = relationship ? undefined : 'kind' in selection ? selection.kind : 'group';
  const label = selection.label ?? selection.id;
  return <aside className="selection-details" aria-label="Selection details">
    <div className="details-topline"><span className="eyebrow">{relationship ? 'Relationship' : KIND_LABELS[kind!]}</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close details"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
    {!relationship && <div className="details-glyph"><Glyph kind={kind!} size={24} /></div>}
    <h2>{label}</h2>
    {selection.description && <p className="details-description">{selection.description}</p>}
    {relationship && <dl className="relationship-endpoints"><dt>From</dt><dd>{model.nodes.find(node => node.id === selection.from)?.label ?? selection.from}</dd><dt>To</dt><dd>{model.nodes.find(node => node.id === selection.to)?.label ?? selection.to}</dd></dl>}
    {!relationship && !('kind' in selection) && <p className="group-explanation">A visual group. Its boundary does not imply an architecture classification.</p>}
    <section aria-labelledby={evidenceHeading}><h3 id={evidenceHeading}>Evidence <span>{selection.evidence.length}</span></h3><ul className="evidence-list">{selection.evidence.map((evidence, index) => <EvidenceItem key={index} evidence={evidence} model={model} />)}</ul></section>
    <div className="details-footnote"><span className="eyebrow">Refine with your agent</span><p>Discuss a correction using this element’s name. Its evidence and relationships remain part of the editable model.</p></div>
  </aside>;
}
