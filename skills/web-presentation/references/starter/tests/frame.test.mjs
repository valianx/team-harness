import assert from 'node:assert/strict';
import test from 'node:test';

test('local frame URLs resolve inside the production base while external HTTPS stays external', async () => {
  const { resolveFrameUrl } = await import('slidev-addon-harness/frame');
  assert.equal(resolveFrameUrl('/demo/index.html', '/talks/feature/', 'https://slides.example'), '/talks/feature/demo/index.html');
  assert.equal(resolveFrameUrl('demo/index.html', '/talks/feature/', 'https://slides.example'), '/talks/feature/demo/index.html');
  assert.equal(resolveFrameUrl('https://apps.example/demo', '/talks/feature/', 'https://slides.example'), 'https://apps.example/demo');
});

for (const source of ['javascript:alert(1)', 'data:text/html,demo', 'file:///private', '//other.example/demo']) {
  test(`frame URL rejects unsupported scheme ${source.split(':')[0]}`, async () => {
    const { resolveFrameUrl } = await import('slidev-addon-harness/frame');
    assert.throws(() => resolveFrameUrl(source, '/talks/feature/', 'https://slides.example'), /unsupported|scheme|URL/i);
  });
}
