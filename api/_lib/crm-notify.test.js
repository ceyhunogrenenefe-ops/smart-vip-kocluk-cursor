import test from 'node:test';
import assert from 'node:assert/strict';

test('buildInboundNotification: yeni aday ve yeni mesaj metni', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { buildInboundNotification, conversationLink } = await import('./crm-notify.js');
  const a = buildInboundNotification({
    isNew: true,
    channel: 'instagram',
    contactName: 'Ayşe Yılmaz',
    gradeProgram: 'grade_7',
    interestedPackage: 'Özel Ders',
    snippet: 'Merhaba   fiyat alabilir miyim?'
  });
  assert.equal(a.title, 'Yeni potansiyel müşteri');
  assert.equal(a.body, 'Instagram · 7. Sınıf / Özel Ders\nAyşe Yılmaz\nMerhaba fiyat alabilir miyim?');
  const b = buildInboundNotification({ isNew: false, channel: 'whatsapp', contactName: '', gradeProgram: 'unspecified', snippet: '' });
  assert.equal(b.title, 'Yeni mesaj · Yeni kişi');
  assert.equal(b.body, 'WhatsApp');
  assert.equal(conversationLink('abc'), '/crm/inbox?c=abc');
});
