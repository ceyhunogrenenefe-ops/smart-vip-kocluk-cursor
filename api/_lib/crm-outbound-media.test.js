import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCrmMediaBuffer, prepareCrmOutboundMedia, safeCrmFilename } from './crm-outbound-media.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('png fotoğraf image olarak gider', () => {
  const r = classifyCrmMediaBuffer({ buffer: PNG, mimeType: 'image/png', filename: 'ekran.png' });
  assert.equal(r.kind, 'image');
  assert.equal(r.mime, 'image/png');
  assert.equal(r.filename, 'ekran.png');
});

test('jpg uzantılı png içeriği png sayılır', () => {
  const r = classifyCrmMediaBuffer({ buffer: PNG, mimeType: 'image/jpeg', filename: 'foto.jpg' });
  assert.equal(r.mime, 'image/png');
  assert.equal(r.kind, 'image');
  assert.ok(r.filename.endsWith('.png'));
});

test('jpeg başlığı image/jpeg olur', () => {
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const r = classifyCrmMediaBuffer({ buffer: buf, filename: 'foto.jpeg', mimeType: '' });
  assert.equal(r.kind, 'image');
  assert.equal(r.mime, 'image/jpeg');
});

test('pdf belge olur, sahte pdf reddedilir', () => {
  const ok = classifyCrmMediaBuffer({
    buffer: Buffer.from('%PDF-1.7\n'),
    mimeType: 'application/pdf',
    filename: 'rapor.pdf'
  });
  assert.equal(ok.kind, 'document');
  assert.throws(
    () => classifyCrmMediaBuffer({ buffer: Buffer.from('not a pdf'), mimeType: 'application/pdf', filename: 'x.pdf' }),
    /PDF değil/
  );
});

test('png diye gelen exe reddedilir', () => {
  assert.throws(
    () =>
      classifyCrmMediaBuffer({
        buffer: Buffer.from([0x4d, 0x5a, 0x00, 0x00]),
        mimeType: 'image/png',
        filename: 'foto.png'
      }),
    /PNG, JPG/
  );
});

test('boş ve büyük dosya reddedilir', () => {
  assert.throws(() => prepareCrmOutboundMedia({ dataBase64: '' }), /boş/);
  const big = Buffer.alloc(30, 0x89);
  assert.throws(
    () => classifyCrmMediaBuffer({ buffer: big, mimeType: 'image/png', filename: 'a.png', maxBytes: 10 }),
    /2,5 MB/
  );
});

test('data url önekini ayıklar', () => {
  const r = prepareCrmOutboundMedia({
    dataBase64: `data:image/png;base64,${PNG.toString('base64')}`,
    mimeType: 'image/png',
    filename: 'a.png'
  });
  assert.equal(r.kind, 'image');
  assert.ok(r.buffer.length > 8);
});

test('dosya adı tehlikeli karakterleri atar', () => {
  assert.equal(safeCrmFilename('../etc/passwd.png', 'dosya'), 'passwd.png');
  assert.equal(safeCrmFilename('', 'dosya'), 'dosya');
});
