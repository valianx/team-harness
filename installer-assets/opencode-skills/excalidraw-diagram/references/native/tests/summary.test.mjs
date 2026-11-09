import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeVerification } from '../summary.mjs';

const statuses = { verification: 'fail', nativeEditability: 'pass', labelVisibility: 'fail', presentationReadability: 'fail' };

test('large reports retain failure counts while diagnostic examples stay bounded', () => {
  const long = 'x'.repeat(20_000);
  const report = { ...statuses, errors: Array(100).fill(long), visibilityErrors: Array(100).fill(long),
    presentationFailures: Array.from({ length: 100 }, () => ({ stage: 'export', metric: 'componentTextPx', count: 20, target: 14,
      ids: Array.from({ length: 20 }, (_, index) => `label-${index}`), reason: long })),
    typography: Array(100).fill({ text: long }), runtime: { lock: long } };
  const result = summarizeVerification(report, '/evidence/verification.json');
  assert.equal(result.report, '/evidence/verification.json');
  for (const [key, value] of Object.entries(statuses)) assert.equal(result[key], value);
  for (const key of ['errors', 'visibilityErrors', 'presentationFailures']) {
    assert.equal(result[key].length, 3);
    assert.equal(result[`${key}Count`], 100);
  }
  assert.equal(result.presentationFailures[0].ids.length, 3);
  assert.ok(JSON.stringify(result).length < 5_000);
  assert.equal(result.typography, undefined);
  assert.equal(result.runtime, undefined);
});

test('review output exposes evidence paths and counts without crop geometry or full findings', () => {
  const report = { ...statuses, errors: [], visibilityErrors: [], presentationFailures: [],
    composition: { status: 'fail', initial: { counts: { error: 4, warning: 2 }, issues: [{ bounds: { width: 900 } }] },
      edited: { counts: { error: 1, warning: 0 }, issues: [{ message: 'full finding' }] } },
    review: { initial: { crops: Array.from({ length: 10 }, (_, index) => ({ path: `review-initial/${index}.png`, bounds: { x: 5 }, elementIds: ['card'] })), omitted: 2 },
      edited: { crops: [], omitted: 0 }, comparison: { path: 'review-comparison/before-after.png', sharedViewBox: { width: 900 } } } };
  const result = summarizeVerification(report, '/evidence/verification.json');
  assert.deepEqual(result.composition, { status: 'fail', initial: { error: 4, warning: 2 }, edited: { error: 1, warning: 0 } });
  assert.equal(result.review.initial.issues, 'review-initial/issues.json');
  assert.equal(result.review.edited.issues, 'review-edited/issues.json');
  assert.deepEqual(result.review.edited.crops, []);
  assert.equal(result.review.initial.crops.length, 8);
  assert.equal(result.review.initial.cropCount, 10);
  assert.equal(result.review.initial.omitted, 4);
  assert.equal(result.review.comparison, 'review-comparison/before-after.png');
  assert.ok(!JSON.stringify(result).includes('bounds'));
  assert.ok(!JSON.stringify(result).includes('full finding'));
});

test('ordinary verification invents no review data and does not mutate its input', () => {
  const report = { verification: 'pass', nativeEditability: 'pass', labelVisibility: 'pass', presentationReadability: 'not-applicable',
    errors: [], visibilityErrors: [], presentationFailures: [] };
  const before = structuredClone(report);
  const result = summarizeVerification(report, 'verification.json');
  assert.equal(result.verification, 'pass');
  assert.equal(result.composition, undefined);
  assert.equal(result.review, undefined);
  assert.deepEqual(result.errors, []);
  assert.equal(result.errorsCount, 0);
  assert.deepEqual(report, before);
});
