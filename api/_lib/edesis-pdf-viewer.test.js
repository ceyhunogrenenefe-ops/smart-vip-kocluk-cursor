import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function buildEdesisPdfViewerSrc(fileUrl, zoom = '100') {
  const base = String(fileUrl || '').trim().replace(/#.*$/, '');
  if (!base) return '';
  const z = String(zoom || '100');
  if (z === 'page-width') {
    return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;
  }
  if (z === 'page-fit') {
    return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=Fit`;
  }
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&zoom=${encodeURIComponent(z)}`;
}

describe('buildEdesisPdfViewerSrc', () => {
  it('defaults to 100% without FitH (page-width was ~181%)', () => {
    const src = buildEdesisPdfViewerSrc('blob:https://x/1#zoom=50');
    assert.equal(src.includes('blob:https://x/1#'), true);
    assert.equal(src.includes('zoom=100'), true);
    assert.equal(src.includes('view=FitH'), false);
    assert.equal(src.includes('zoom=50'), false);
  });

  it('uses FitH only for page-width chip', () => {
    const src = buildEdesisPdfViewerSrc('blob:https://x/1', 'page-width');
    assert.equal(src.includes('view=FitH'), true);
    assert.equal(src.includes('zoom=100'), false);
  });

  it('returns empty for blank url', () => {
    assert.equal(buildEdesisPdfViewerSrc(''), '');
  });
});
