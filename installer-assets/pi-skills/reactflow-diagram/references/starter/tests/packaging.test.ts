import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

async function packagedProject(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'diagram-package-'));
  try {
    await mkdir(join(root, 'scripts'));
    await copyFile(new URL('../gitignore.txt', import.meta.url), join(root, 'gitignore.txt'));
    await copyFile(new URL('../scripts/prepare-project.mjs', import.meta.url), join(root, 'scripts/prepare-project.mjs'));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('packaged starter prepares ignore rules even when dotfiles are omitted', async () => {
  await packagedProject(async root => {
    execFileSync(process.execPath, [join(root, 'scripts/prepare-project.mjs')]);
    assert.deepEqual((await readFile(join(root, '.gitignore'), 'utf8')).trim().split('\n'), ['node_modules/', 'dist/', 'test-results/', 'playwright-report/']);
    execFileSync(process.execPath, [join(root, 'scripts/prepare-project.mjs')]);
    assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), await readFile(join(root, 'gitignore.txt'), 'utf8'));
  });
});

test('preparing a copied project preserves an existing custom ignore file', async () => {
  await packagedProject(async root => {
    const original = '# Manual consumer rules\nprivate-assets/\n';
    await writeFile(join(root, '.gitignore'), original);
    execFileSync(process.execPath, [join(root, 'scripts/prepare-project.mjs')]);
    assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), original);
  });
});
