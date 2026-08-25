import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function buildEdesisPdfViewerSrc(fileUrl, zoom = 'page-width') {
  const base = String(fileUrl || '').trim().replace(/#.*$/, '');
  if (!base) return '';
  const z = encodeURIComponent(zoom);
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=${z}`;
}

describe('buildEdesisPdfViewerSrc', () => {
  it('fits page width and strips old hash', () => {
    const src = buildEdesisPdfViewerSrc('blob:https://x/1#zoom=50', 'page-width');
    assert.equal(src.includes('blob:https://x/1#'), true);
    assert.equal(src.includes('zoom=page-width'), true);
    assert.equal(src.includes('view=FitH'), true);
    assert.equal(src.includes('zoom=50'), false);
  });

  it('returns empty for blank url', () => {
    assert.equal(buildEdesisPdfViewerSrc(''), '');
  });
});
