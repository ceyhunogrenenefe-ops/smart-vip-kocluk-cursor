import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffImageDataUrl } from '../../handlers/public-brand-kit.js';

/**
 * Kurumun kayitli logosu "data:image/jpeg" etiketli ama govdesi PNG.
 * Tarayici bunu tolere eder, jsPDF etmez; yanlis bicimle cagrilan
 * addImage bozuk cikti verir. Bu yuzden etikete degil govdeye bakiyoruz.
 */
test('MIME etiketi yanlissa govdeden duzeltir', () => {
  const r = sniffImageDataUrl('data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEA');
  assert.equal(r.mime, 'image/png');
  assert.ok(r.dataUrl.startsWith('data:image/png;base64,'));
});

test('PNG etiketli JPEG govdesini de duzeltir', () => {
  const r = sniffImageDataUrl('data:image/png;base64,/9j/4AAQSkZJRgABAQ');
  assert.equal(r.mime, 'image/jpeg');
});

test('dogru etiketi bozmaz', () => {
  assert.equal(sniffImageDataUrl('data:image/jpeg;base64,/9j/4AAQ').mime, 'image/jpeg');
  assert.equal(sniffImageDataUrl('data:image/png;base64,iVBORw0KGgo').mime, 'image/png');
});

test('gif, webp ve svg tanir', () => {
  assert.equal(sniffImageDataUrl('data:application/octet-stream;base64,R0lGODlhAQ').mime, 'image/gif');
  assert.equal(sniffImageDataUrl('data:application/octet-stream;base64,UklGRiQA').mime, 'image/webp');
  assert.equal(sniffImageDataUrl('data:text/plain;base64,PHN2ZyB4bWxucz0').mime, 'image/svg+xml');
});

test('gecersiz girdilerde null doner', () => {
  for (const v of ['', null, undefined, 'merhaba', 'data:image/png,abc', 'data:image/png;base64,']) {
    assert.equal(sniffImageDataUrl(v), null, String(v));
  }
});
