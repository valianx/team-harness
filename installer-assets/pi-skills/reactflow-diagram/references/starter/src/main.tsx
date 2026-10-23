import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { FIXTURES } from './fixtures';
import { ArchitectureViewer } from './viewer';

const query = new URLSearchParams(location.search);
const fixture = query.get('fixture') ?? 'sample';
const model = FIXTURES[fixture] ?? FIXTURES.sample;
const embedded = query.get('embed');

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
  {embedded ? <main className="embedded-page"><div data-embed-host style={{ width: embedded === 'zero' ? 0 : '100%', height: embedded === 'zero' ? 0 : 650 }}><ArchitectureViewer model={model} /></div></main> : <main className="diagram-page">
    <div className="page-heading"><a className="kit-wordmark" href="./" aria-label="Architecture viewer home"><span className="wordmark-symbol" aria-hidden="true"><i /><i /><i /></span><span>Architecture <span className="wordmark-divider">/</span> viewer</span></a><span className="page-caption">From source to system</span></div>
    <div className="page-viewer"><ArchitectureViewer model={model} /></div>
    <div className="page-footnote"><span>Select a component or connection to trace its evidence.</span><span>Pan to explore · Scroll to zoom · Tab to navigate</span></div>
  </main>}
</React.StrictMode>);
