import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeNocookieEmbedUrl } from '../video-solution-youtube.js';

/** embed_url sözleşmesi — public read modülü bunu kullanır */
test('public soru embed_url nocookie', () => {
  const url = youtubeNocookieEmbedUrl('abc123XYZ12');
  assert.match(url, /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
});
