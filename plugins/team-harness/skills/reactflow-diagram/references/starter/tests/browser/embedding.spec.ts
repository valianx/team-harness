import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { test, expect } from '@playwright/test';
import { ArchitectureViewer } from '../../src/viewer/ArchitectureViewer';

test('the embedded shell renders before browser APIs are available', () => {
  const model = JSON.parse(readFileSync(new URL('../../fixtures/payment-demo.json', import.meta.url), 'utf8'));
  const html = renderToString(createElement(ArchitectureViewer, { model }));
  expect(html).toContain(`${model.title} architecture viewer`);
});
