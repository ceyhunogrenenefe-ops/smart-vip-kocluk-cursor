import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYoutubeVideoId, youtubeNocookieEmbedUrl } from '../video-solution-youtube.js';

test('parseYoutubeVideoId — ham id', () => {
  assert.equal(parseYoutubeVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('parseYoutubeVideoId — watch', () => {
  assert.equal(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('parseYoutubeVideoId — youtu.be ve shorts', () => {
  assert.equal(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYoutubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('youtubeNocookieEmbedUrl', () => {
  assert.equal(
    youtubeNocookieEmbedUrl('abc123_-XYZ'),
    'https://www.youtube-nocookie.com/embed/abc123_-XYZ'
  );
});
