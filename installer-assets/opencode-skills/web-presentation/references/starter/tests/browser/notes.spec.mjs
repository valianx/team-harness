import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { copyForFixture, execFile, filesContaining, fixtures } from './support.mjs';

test('native note canary is included in a positive control and excluded by the normal build', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const canary = 'WEB_PRESENTATION_PRIVATE_NOTE_CANARY_712';
  const raw = await readFile(resolve(fixtures, 'notes.md'), 'utf8');
  const directory = await copyForFixture(testInfo.outputPath('notes-project'), raw);
  const bin = resolve(directory, 'node_modules/@slidev/cli/bin/slidev.mjs');
  const positive = await execFile(process.execPath, [bin, 'build', 'slides.md', '--base', '/privacy-control/', '--out', 'positive', '--without-notes', 'false'], { cwd: directory, maxBuffer: 10 * 1024 * 1024 });
  await writeFile(testInfo.outputPath('notes-positive-build.log'), positive.stdout + positive.stderr);
  const included = await filesContaining(resolve(directory, 'positive'), canary);
  expect(included, 'The positive control must prove this native note reaches build output').not.toEqual([]);
  const normal = await execFile(process.execPath, ['scripts/build.mjs', '--base', '/privacy-control/', '--out', 'delivery'], { cwd: directory, maxBuffer: 10 * 1024 * 1024 });
  await writeFile(testInfo.outputPath('notes-public-build.log'), normal.stdout + normal.stderr);
  const excluded = await filesContaining(resolve(directory, 'delivery'), canary);
  await writeFile(testInfo.outputPath('notes-evidence.json'), JSON.stringify({ sourceContainsCanary: raw.includes(canary), positiveFiles: included, publicFiles: excluded, limit: 'Notes exclusion is not a confidentiality assessment of other source, assets or external resources.' }, null, 2));
  expect(excluded).toEqual([]);
});
