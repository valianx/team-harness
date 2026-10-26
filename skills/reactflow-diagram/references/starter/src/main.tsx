import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import editableModel from '../fixtures/sample.json';
import { FIXTURES } from './fixtures';
import { ArchitectureViewer } from './viewer';
import type { CompositionMode } from './types';

const query = new URLSearchParams(location.search);
const fixture = query.get('fixture');
const model = fixture === null ? editableModel : FIXTURES[fixture] ?? FIXTURES.sample;
const embedded = query.get('embed');
const requestedComposition = query.get('composition');
const composition: CompositionMode = requestedComposition === 'layered' || requestedComposition === 'compact' ? requestedComposition : 'auto';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
  {embedded ? <main className="embedded-page"><div data-embed-host style={{ width: embedded === 'zero' ? 0 : '100%', height: embedded === 'zero' ? 0 : 650 }}><ArchitectureViewer model={model} composition={composition} /></div></main> : <main className="diagram-page"><ArchitectureViewer model={model} composition={composition} /></main>}
</React.StrictMode>);
