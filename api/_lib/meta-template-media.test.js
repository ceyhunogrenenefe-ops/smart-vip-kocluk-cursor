import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEADER_MEDIA_RULES, validateHeaderMedia } from './meta-template-media.js';

describe('başlık medyası doğrulama', () => {
  it('görsel: JPG/PNG kabul, diğerleri ret', () => {
    assert.equal(validateHeaderMedia({ headerType: 'IMAGE', mimeType: 'image/png', size: 1000 }).ok, true);
    assert.equal(validateHeaderMedia({ headerType: 'IMAGE', mimeType: 'image/jpeg', size: 1000 }).ok, true);
    const r = validateHeaderMedia({ headerType: 'IMAGE', mimeType: 'image/gif', size: 1000 });
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('JPG'));
  });

  it('video ve belge kuralları', () => {
    assert.equal(validateHeaderMedia({ headerType: 'VIDEO', mimeType: 'video/mp4', size: 1000 }).ok, true);
    assert.equal(validateHeaderMedia({ headerType: 'DOCUMENT', mimeType: 'application/pdf', size: 1000 }).ok, true);
    assert.equal(validateHeaderMedia({ headerType: 'DOCUMENT', mimeType: 'video/mp4', size: 1000 }).ok, false);
  });

  it('boyut sınırı aşılırsa Türkçe sebep döner', () => {
    const r = validateHeaderMedia({ headerType: 'IMAGE', mimeType: 'image/png', size: 9 * 1024 * 1024 });
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('çok büyük'));
  });

  it('boş dosya reddedilir', () => {
    assert.equal(validateHeaderMedia({ headerType: 'IMAGE', mimeType: 'image/png', size: 0 }).ok, false);
  });

  it('medya kabul etmeyen başlık türü', () => {
    assert.equal(validateHeaderMedia({ headerType: 'TEXT', mimeType: 'image/png', size: 10 }).ok, false);
    assert.equal(validateHeaderMedia({ headerType: 'NONE', mimeType: 'image/png', size: 10 }).ok, false);
  });

  it('mime içindeki charset eki sorun çıkarmaz', () => {
    assert.equal(validateHeaderMedia({ headerType: 'DOCUMENT', mimeType: 'application/pdf; charset=binary', size: 10 }).ok, true);
  });

  it('üç medya türü tanımlı', () => {
    assert.deepEqual(Object.keys(HEADER_MEDIA_RULES), ['IMAGE', 'VIDEO', 'DOCUMENT']);
  });
});
