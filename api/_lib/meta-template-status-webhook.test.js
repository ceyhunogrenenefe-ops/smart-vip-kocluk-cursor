import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTemplateStatusChange, readableRejectionReason } from './meta-template-status-webhook.js';

describe('şablon durumu webhook tanıma', () => {
  it('doğru alan tanınır', () => {
    assert.equal(isTemplateStatusChange({ field: 'message_template_status_update' }), true);
    assert.equal(isTemplateStatusChange({ field: 'template_status_update' }), true);
  });
  it('mesaj olayları karışmaz', () => {
    assert.equal(isTemplateStatusChange({ field: 'messages' }), false);
    assert.equal(isTemplateStatusChange({ field: 'comments' }), false);
    assert.equal(isTemplateStatusChange({}), false);
    assert.equal(isTemplateStatusChange(null), false);
  });
});

describe('ret gerekçesi', () => {
  it('bilinen kodlar Türkçeye çevrilir', () => {
    assert.ok(readableRejectionReason({ reason: 'INCORRECT_CATEGORY' }).includes('Kategori'));
    assert.ok(readableRejectionReason({ reason: 'INVALID_FORMAT' }).includes('Biçim'));
  });
  it('NONE gerekçe sayılmaz', () => {
    assert.equal(readableRejectionReason({ reason: 'NONE' }), null);
    assert.equal(readableRejectionReason({}), null);
  });
  it('bilinmeyen kod olduğu gibi gösterilir', () => {
    assert.equal(readableRejectionReason({ reason: 'SOMETHING_NEW' }), 'SOMETHING_NEW');
  });
  it('Metanın açıklaması varsa eklenir', () => {
    const r = readableRejectionReason({ reason: 'INVALID_FORMAT', other_info: { description: 'Header eksik' } });
    assert.ok(r.includes('Biçim'));
    assert.ok(r.includes('Header eksik'));
  });
});
