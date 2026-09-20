/** Gelen mesaj etiketleri: "[unsupported]" yerine anlaşılır metin, eklerde bağlantı */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { whatsappInboundBody, instagramAttachmentSummary, unsupportedLabel } from './crm-inbound-labels.js';

describe('whatsappInboundBody', () => {
  it('keeps plain text as-is', () => {
    assert.deepEqual(whatsappInboundBody({ type: 'text', text: { body: 'Merhaba' } }), {
      body: 'Merhaba',
      mediaUrl: null
    });
  });

  it('explains Meta unsupported (131060) instead of [unsupported]', () => {
    const m = {
      type: 'unsupported',
      errors: [{ code: 131060, title: 'This message is unavailable.' }]
    };
    const r = whatsappInboundBody(m);
    assert.match(r.body, /Mesaj alınamadı/);
    assert.match(r.body, /131060/);
    assert.ok(!r.body.includes('[unsupported]'));
  });

  it('labels media in Turkish and keeps the media id', () => {
    assert.deepEqual(whatsappInboundBody({ type: 'image', image: { id: '123' } }), {
      body: '[Fotoğraf]',
      mediaUrl: 'meta-media:123'
    });
    assert.equal(whatsappInboundBody({ type: 'audio', audio: { id: '9' } }).body, '[Sesli mesaj]');
    assert.equal(whatsappInboundBody({ type: 'document', document: { id: '9', caption: 'Karne.pdf' } }).body, 'Karne.pdf');
  });

  it('describes reaction, revoke and edit', () => {
    assert.equal(whatsappInboundBody({ type: 'reaction', reaction: { emoji: '👍' } }).body, 'Tepki verdi: 👍');
    assert.equal(whatsappInboundBody({ type: 'revoke' }).body, 'Müşteri bu mesajı sildi');
    assert.equal(
      whatsappInboundBody({ type: 'edit', edit: { text: { body: 'yeni metin' } } }).body,
      'Mesajını düzenledi: yeni metin'
    );
  });

  it('falls back to the raw type for unknown kinds', () => {
    assert.equal(whatsappInboundBody({ type: 'foo' }).body, '[foo]');
  });
});

describe('instagramAttachmentSummary', () => {
  it('names the attachment type and keeps its url', () => {
    const r = instagramAttachmentSummary({
      attachments: [{ type: 'ig_post', payload: { url: 'https://lookaside.fbsbx.com/x?asset_id=1' } }]
    });
    assert.equal(r.body, '[Instagram gönderisi]');
    assert.equal(r.mediaUrl, 'https://lookaside.fbsbx.com/x?asset_id=1');
  });

  it('counts extra attachments and ignores non-http urls', () => {
    const r = instagramAttachmentSummary({
      attachments: [
        { type: 'image', payload: { url: 'data:image/png;base64,AAA' } },
        { type: 'image', payload: { url: 'https://x/2' } }
      ]
    });
    assert.equal(r.body, '[Fotoğraf] (+1)');
    assert.equal(r.mediaUrl, null);
  });

  it('handles stickers and empty payloads', () => {
    assert.equal(instagramAttachmentSummary({ sticker_id: 5 }).body, '[Çıkartma]');
    assert.deepEqual(instagramAttachmentSummary({}), { body: null, mediaUrl: null });
  });
});

assert.match(unsupportedLabel({ errors: [] }), /Mesaj alınamadı/);
