import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoEmbedUrl, parseVideoSource } from '../video-solution-media.js';

test('parseVideoSource — YouTube watch', () => {
  const p = parseVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(p?.provider, 'youtube');
  assert.equal(p?.ref, 'dQw4w9WgXcQ');
});

test('parseVideoSource — Vimeo', () => {
  const p = parseVideoSource('https://vimeo.com/123456789');
  assert.equal(p?.provider, 'vimeo');
  assert.equal(p?.ref, '123456789');
  assert.match(buildVideoEmbedUrl('vimeo', '123456789'), /player\.vimeo\.com\/video\/123456789/);
});

test('parseVideoSource — Google Drive', () => {
  const p = parseVideoSource('https://drive.google.com/file/d/1abcXYZ_123/view?usp=sharing');
  assert.equal(p?.provider, 'google_drive');
  assert.equal(p?.ref, '1abcXYZ_123');
  assert.match(buildVideoEmbedUrl('google_drive', '1abcXYZ_123'), /drive\.google\.com\/file\/d\/1abcXYZ_123\/preview/);
});

test('parseVideoSource — genel https external', () => {
  const p = parseVideoSource('https://example.com/video/page');
  assert.equal(p?.provider, 'external');
  assert.equal(buildVideoEmbedUrl('external', p.ref), null);
});
