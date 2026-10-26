import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { findPython } from '../python.mjs';

test('scene guards use a working Python 3 command and reject an invalid explicit interpreter', () => {
  const python = findPython();
  const result = spawnSync(python.command, [...python.prefix, '-c', 'import sys; print(sys.version_info.major)'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '3');
  assert.throws(() => findPython('/does-not-exist/th-python'), /Python 3/);
});
