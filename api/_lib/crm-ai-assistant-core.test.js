import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_TOOLS,
  DEFAULT_SCHEDULE,
  buildDynamicContext,
  buildKvkkNotice,
  buildStaticSystemPrompt,
  buildToneExcerpt,
  classifyAiServiceError,
  computeFreeSlots,
  decideRun,
  formatForChannel,
  gradeProgramCode,
  historyToMessages,
  htmlToText,
  isWithinMessagingWindow,
  isWithinSchedule,
  maskPii,
  mergeCollected,
  nonChatInboundReason,
  normalizeTrPhone,
  parseChatExport,
  parseInstagramExport,
  parseWhatsAppExport,
  pickConsultant,
  runAssistantLoop,
  sanitizeSiteUrls,
  slotLabel,
  validateBooking
} from './crm-ai-assistant-core.js';

/** İstanbul saatiyle an: 2026-11-19 Perşembe */
const ist = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+03:00`);

test('çalışma saati: hafta içi 19:00–09:00, hafta sonu tüm gün', () => {
  assert.equal(isWithinSchedule(DEFAULT_SCHEDULE, ist('2026-11-19', '20:30')), true); // Perşembe akşam
  assert.equal(isWithinSchedule(DEFAULT_SCHEDULE, ist('2026-11-19', '08:59')), true); // Perşembe sabah
  assert.equal(isWithinSchedule(DEFAULT_SCHEDULE, ist('2026-11-19', '09:00')), false); // mesai başladı
  assert.equal(isWithinSchedule(DEFAULT_SCHEDULE, ist('2026-11-19', '14:00')), false);
  assert.equal(isWithinSchedule(DEFAULT_SCHEDULE, ist('2026-11-21', '14:00')), true); // Cumartesi
  assert.equal(isWithinSchedule(DEFAULT_SCHEDULE, ist('2026-11-23', '07:00')), true); // Pazartesi sabah
});

test('çalışma saati: gece yarısını geçen aralık ertesi güne taşar', () => {
  const sch = { 1: [], 2: [], 3: [], 4: [{ start: '19:00', end: '09:00' }], 5: [], 6: [], 7: [] };
  assert.equal(isWithinSchedule(sch, ist('2026-11-19', '23:00')), true); // Perşembe
  assert.equal(isWithinSchedule(sch, ist('2026-11-20', '08:00')), true); // Cuma sabahı (Perşembe aralığı)
  assert.equal(isWithinSchedule(sch, ist('2026-11-20', '10:00')), false);
  assert.equal(isWithinSchedule(sch, ist('2026-11-20', '20:00')), false); // Cuma akşamı kapalı
});

test('24 saat penceresi', () => {
  const now = Date.parse('2026-11-19T20:00:00Z');
  assert.equal(isWithinMessagingWindow('2026-11-19T10:00:00Z', now), true);
  assert.equal(isWithinMessagingWindow('2026-11-18T20:10:00Z', now), false); // 30 dk güvenlik payı
  assert.equal(isWithinMessagingWindow(null, now), false);
});

test('sınıf → CRM kodu', () => {
  assert.equal(gradeProgramCode('8', 'LGS'), 'lgs');
  assert.equal(gradeProgramCode('12. sınıf', ''), 'yks');
  assert.equal(gradeProgramCode('mezun', ''), 'yks');
  assert.equal(gradeProgramCode('10', 'okul'), 'grade_10');
  assert.equal(gradeProgramCode('', 'TYT'), 'yks');
  assert.equal(gradeProgramCode('', ''), null);
});

test('telefon normalizasyonu', () => {
  assert.equal(normalizeTrPhone('0532 123 45 67'), '905321234567');
  assert.equal(normalizeTrPhone('+90 (532) 123-45-67'), '905321234567');
  assert.equal(normalizeTrPhone('5321234567'), '905321234567');
  assert.equal(normalizeTrPhone('0212 123 45 67'), null);
  assert.equal(normalizeTrPhone('123'), null);
});

const shifts = [
  { user_id: 'a', day_of_week: 5, start_time: '09:00:00', end_time: '12:00:00', is_active: true }, // Cuma
  { user_id: 'b', day_of_week: 5, start_time: '10:00:00', end_time: '11:00:00', is_active: true },
  { user_id: 'c', day_of_week: 4, start_time: '22:00:00', end_time: '01:00:00', is_active: true } // Perşembe gece
];

test('boş saatler: vardiyadan üretilir, dolu görev ve yakın saatler atlanır', () => {
  const now = ist('2026-11-19', '21:30'); // Perşembe
  const busy = [{ assigned_to: 'a', due_at: '2026-11-20T09:00:00+03:00', status: 'pending' }];
  const slots = computeFreeSlots({ shifts, busyTasks: busy, now, slotMinutes: 30, daysAhead: 1, minLeadMinutes: 60, maxSlots: 20, maxPerDay: 20 });
  const starts = slots.map((s) => s.start_iso);
  // Perşembe 22:00 < 22:30 (en erken) → yok; 22:30 var; gece yarısını geçen vardiyadan Cuma 00:00 var
  assert.ok(!starts.includes('2026-11-19T22:00:00+03:00'));
  assert.ok(starts.includes('2026-11-19T22:30:00+03:00'));
  assert.ok(starts.includes('2026-11-20T00:00:00+03:00'));
  // aynı saatten tek seçenek: 00:30 elenir
  assert.ok(!starts.includes('2026-11-20T00:30:00+03:00'));
  // a 09:00'da dolu; aynı saatte başka danışman yok → 09:00 sunulmaz, 09:30 sunulur
  assert.ok(!starts.includes('2026-11-20T09:00:00+03:00'));
  assert.ok(starts.includes('2026-11-20T09:30:00+03:00'));
  const ten = slots.find((s) => s.start_iso === '2026-11-20T10:00:00+03:00');
  assert.deepEqual(ten.user_ids.sort(), ['a', 'b']);
});

test('boş saatler: danışman filtresi ve günlük yayılım', () => {
  const now = ist('2026-11-19', '21:30');
  const slots = computeFreeSlots({ shifts, consultantIds: ['b'], now, daysAhead: 2 });
  assert.deepEqual(
    slots.map((s) => s.start_iso),
    ['2026-11-20T10:00:00+03:00']
  ); // saat başına bir seçenek
  const spread = computeFreeSlots({ shifts, now, daysAhead: 1, maxPerDay: 2, maxSlots: 3 });
  assert.equal(spread.length, 3);
  assert.equal(new Set(spread.map((s) => s.start_iso.slice(0, 13))).size, 3);
});

test('danışman seçimi en az yüklüye', () => {
  const busy = [{ assigned_to: 'a' }, { assigned_to: 'a' }, { assigned_to: 'b' }];
  assert.equal(pickConsultant(['a', 'b'], busy), 'b');
  assert.equal(pickConsultant([], busy), null);
});

test('slot etiketi Türkçe', () => {
  assert.equal(slotLabel('2026-11-20T10:00:00+03:00'), '20 Kasım Cuma 10:00');
});

test('randevu doğrulama: 18 yaş altı için veli zorunlu, saat listede olmalı', () => {
  const allowedStarts = ['2026-11-20T10:00:00+03:00'];
  const base = { start_iso: allowedStarts[0], student_name: 'Ali', grade: '8', target: 'LGS', phone: '0532 111 22 33' };
  const minor = validateBooking({ ...base, is_minor: true }, { allowedStarts });
  assert.equal(minor.ok, false);
  assert.ok(minor.errors.some((e) => e.includes('parent_name')));
  const ok = validateBooking({ ...base, is_minor: true, parent_name: 'Ayşe', parent_phone: '05324445566' }, { allowedStarts });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.parent_phone, '905324445566');
  const adult = validateBooking({ ...base, grade: 'mezun', is_minor: false }, { allowedStarts });
  assert.equal(adult.ok, true);
  const wrongSlot = validateBooking({ ...base, is_minor: false, start_iso: '2026-11-20T11:00:00+03:00' }, { allowedStarts });
  assert.equal(wrongSlot.ok, false);
  // is_minor belirtilmezse güvenli taraf: küçük sayılır
  assert.equal(validateBooking(base, { allowedStarts }).ok, false);
});

test('toplanan bilgiler birleşir, telefon normalize edilir', () => {
  const a = mergeCollected({}, { student_name: 'Ali', phone: '0532 111 22 33', grade: '' });
  const b = mergeCollected(a, { grade: '8', is_minor: true, phone: 'yok' });
  assert.deepEqual(b, { student_name: 'Ali', phone: '905321112233', grade: '8', is_minor: true });
});

test('HTML → metin', () => {
  const { title, text } = htmlToText(
    '<html><head><title>LGS Hazırlık &amp; Koçluk</title><style>.x{}</style></head><body><script>var a=1</script><h1>LGS</h1><p>Yıllık 120.000&#8378;</p><ul><li>Küçük grup</li></ul></body></html>'
  );
  assert.equal(title, 'LGS Hazırlık & Koçluk');
  assert.match(text, /LGS/);
  assert.match(text, /120\.000₺/);
  assert.match(text, /• Küçük grup/);
  assert.doesNotMatch(text, /var a/);
});

test('site adresleri yalnız kendi alan adından', () => {
  const urls = sanitizeSiteUrls([
    'https://www.onlinevipdershane.com/programlar/lgs.html#fiyat',
    'https://onlinevipdershane.com/kayit.html',
    'https://evil.example.com/x',
    'javascript:alert(1)',
    'https://www.onlinevipdershane.com/programlar/lgs.html'
  ]);
  assert.deepEqual(urls, ['https://www.onlinevipdershane.com/programlar/lgs.html', 'https://onlinevipdershane.com/kayit.html']);
});

test('WhatsApp dışa aktarımı (Android + iOS) ayrıştırılır', () => {
  const android = [
    '19.11.2026 21:04 - Mesajlar ve aramalar uçtan uca şifrelidir.',
    '19.11.2026 21:04 - Ayşe Yılmaz: Merhaba LGS için bilgi alabilir miyim',
    '19.11.2026 21:05 - Online VIP Dershane: Merhabalar, tabii ki 😊',
    'Öğrencimiz kaçıncı sınıf?',
    '19.11.2026 21:06 - Ayşe Yılmaz: <Medya dahil edilmedi>'
  ].join('\n');
  const a = parseWhatsAppExport(android);
  assert.equal(a.length, 2);
  assert.equal(a[1].text, 'Merhabalar, tabii ki 😊\nÖğrencimiz kaçıncı sınıf?');
  const ios = '[19.11.2026, 21:04:05] Mehmet: Fiyat nedir?\n[19.11.2026, 21:05:00] VIP Danışman: Programa göre değişiyor';
  const b = parseWhatsAppExport(ios);
  assert.deepEqual(b.map((m) => m.author), ['Mehmet', 'VIP Danışman']);
});

test('Instagram JSON dışa aktarımı ve bozuk Türkçe karakter düzeltmesi', () => {
  const json = JSON.stringify({
    messages: [
      { sender_name: 'onlinevipdershane', timestamp_ms: 2, content: 'Merhaba, size nasÄ±l yardÄ±mcÄ± olabilirim?' },
      { sender_name: 'veli123', timestamp_ms: 1, content: 'Fiyat?' },
      { sender_name: 'veli123', timestamp_ms: 3 }
    ]
  });
  const msgs = parseInstagramExport(json);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].text, 'Fiyat?');
  assert.equal(msgs[1].text, 'Merhaba, size nasıl yardımcı olabilirim?');
  assert.equal(parseChatExport('message_1.json', json).kind, 'instagram');
  assert.equal(parseChatExport('sohbet.txt', '19.11.2026 21:04 - A: b').kind, 'whatsapp');
});

test('ton örneği anonimleşir: temsilci / müşteri, telefon ve ad maskelenir', () => {
  const msgs = [
    { author: 'Ayşe Yılmaz', text: 'Numaram 0532 111 22 33, Ayşe ben' },
    { author: 'Online VIP Dershane', text: 'Teşekkürler Ayşe Hanım' }
  ];
  const { excerpt, businessAuthor } = buildToneExcerpt(msgs);
  assert.equal(businessAuthor, 'Online VIP Dershane');
  assert.match(excerpt, /^Müşteri: Numaram \[telefon\], \[ad\] ben$/m);
  assert.match(excerpt, /^Temsilci: Teşekkürler \[ad\] Hanım$/m);
  assert.doesNotMatch(excerpt, /0532|Ayşe/);
  assert.equal(maskPii('a@b.com'), '[e-posta]');
});

test('konuşma geçmişi Claude mesajlarına çevrilir', () => {
  const rows = [
    { sender_type: 'bot', body: 'KVKK bildirimi' },
    { sender_type: 'lead', body: 'Merhaba' },
    { sender_type: 'lead', body: 'LGS fiyat?' },
    { sender_type: 'agent', body: 'Merhaba!' },
    { sender_type: 'lead', body: '[Gönderi yorumu]', message_type: 'comment' },
    { sender_type: 'lead', body: 'Teşekkürler' }
  ];
  assert.deepEqual(historyToMessages(rows), [
    { role: 'user', content: 'Merhaba\nLGS fiyat?' },
    { role: 'assistant', content: 'Merhaba!' },
    { role: 'user', content: '[Gönderi yorumu]\nTeşekkürler' }
  ]);
});

test('yorum otomasyonu: yorum + PDF DM bağlam olarak kalır', () => {
  const rows = [
    { sender_type: 'lead', body: 'LGS', message_type: 'comment' },
    { sender_type: 'bot', body: 'Merhaba, PDF: https://drive.google.com/x' },
    { sender_type: 'lead', body: 'Teşekkürler, 8. sınıfım' }
  ];
  assert.deepEqual(historyToMessages(rows), [
    { role: 'user', content: '[Gönderi yorumu] LGS' },
    { role: 'assistant', content: 'Merhaba, PDF: https://drive.google.com/x' },
    { role: 'user', content: 'Teşekkürler, 8. sınıfım' }
  ]);
});

test('Claude servis hataları sınıflanır (devir yapılmaz)', () => {
  const credit = Object.assign(new Error('400 {"error":{"message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 });
  assert.equal(classifyAiServiceError(credit), 'billing');
  assert.equal(classifyAiServiceError(new Error('ANTHROPIC_API_KEY tanımlı değil')), 'auth');
  assert.equal(classifyAiServiceError(Object.assign(new Error('x'), { status: 401 })), 'auth');
  assert.equal(classifyAiServiceError(Object.assign(new Error('x'), { status: 429 })), 'rate_limit');
  assert.equal(classifyAiServiceError(Object.assign(new Error('Overloaded'), { status: 529 })), 'overloaded');
  assert.equal(classifyAiServiceError(Object.assign(new Error('x'), { status: 500 })), 'server');
  assert.equal(classifyAiServiceError(new Error('Request timed out.')), 'network');
  // Meta gönderim hataları servis hatası değildir
  assert.equal(classifyAiServiceError(new Error('(#10) Bu mesaj izin verilen zaman aralığının dışında gönderilir.')), null);
  assert.equal(classifyAiServiceError(null), null);
});

test('Markdown kanala göre düz metne çevrilir', () => {
  const md = '## Programlar\n**Deneme Kulübü** ile:\n- 10 kademe\n* Kargo\n[Kayıt](https://onlinevipdershane.com/x)\n\n\n\nSon';
  assert.equal(
    formatForChannel(md, 'whatsapp'),
    'Programlar\n*Deneme Kulübü* ile:\n• 10 kademe\n• Kargo\nKayıt: https://onlinevipdershane.com/x\n\nSon'
  );
  assert.equal(
    formatForChannel(md, 'instagram'),
    'Programlar\nDeneme Kulübü ile:\n• 10 kademe\n• Kargo\nKayıt: https://onlinevipdershane.com/x\n\nSon'
  );
  // Düz metin ve çarpma/fiyat ifadeleri bozulmaz
  assert.equal(formatForChannel('Haftada 2*3 saat, 1.500₺', 'instagram'), 'Haftada 2*3 saat, 1.500₺');
  assert.equal(formatForChannel('https://x.com/a', 'whatsapp'), 'https://x.com/a');
  assert.match(buildStaticSystemPrompt({}), /Markdown kullanma/);
});

test('program sorularında önce cevap, sonra bağlantı; ilk mesajda fiyat yok', () => {
  const p = buildStaticSystemPrompt({});
  assert.match(p, /Önce sorduğu konuyu kısaca anlat/);
  assert.match(p, /https:\/\/www\.onlinevipdershane\.com\/ozel-ders\.html/);
  assert.match(p, /https:\/\/www\.onlinevipdershane\.com\/deneme-kulubu/);
  assert.match(p, /İlk yazışmalarda ücret/);
  assert.match(p, /Tek başına "danışmanımız sizi arayacak" diye cevap verme/);
  assert.doesNotMatch(p, /Fiyat sorulursa bilgi tabanındaki fiyatı aynen/);
});

test('yorum ve takip butonu asistanı tetiklemez', () => {
  assert.equal(nonChatInboundReason({ messageType: 'comment' }), 'comment');
  assert.equal(nonChatInboundReason({ messageType: 'text', quickReplyPayload: 'ig_follow_gate:abc:claim' }), 'follow_gate_button');
  assert.equal(nonChatInboundReason({ messageType: 'text', quickReplyPayload: 'baska_buton' }), null);
  assert.equal(nonChatInboundReason({ messageType: 'text' }), null);
  assert.match(buildStaticSystemPrompt({}), /YORUM OTOMASYONUNDAN GELENLER/);
});

test('sistem talimatı: bilgi tabanı, KVKK ve uydurmama kuralı', () => {
  const p = buildStaticSystemPrompt({ kbPages: [{ url: 'https://x/lgs', title: 'LGS', content: 'Yıllık 120.000₺' }], toneGuide: 'Sıcak ol' });
  assert.match(p, /UYDURMA/);
  assert.match(p, /<sayfa url="https:\/\/x\/lgs"/);
  assert.match(p, /<ton_rehberi>\nSıcak ol/);
  assert.match(p, /18 yaşından küçükse/);
  assert.match(buildStaticSystemPrompt({}), /Bilgi tabanı boş/);
  assert.match(p, /dijital asistan/);
  assert.match(p, /ozel-ders\.html/);
  assert.match(p, /deneme-kulubu/);
  assert.match(p, /WhatsApp'ta telefon numarası İSTEME/);
});

test('karşılama metni: Eğitim Destek Asistanı, KVKK bağlantısı, bot/satış/yapay zekâ yok', () => {
  assert.equal(
    buildKvkkNotice(),
    'Merhaba 👋 Ben Online VIP Dershane’nin Eğitim Destek Asistanıyım. Ders programlarımız hakkında bilgi verebilir, dilerseniz sizi ilgili sınıfın eğitim danışmanına yönlendirebilirim. Size nasıl yardımcı olabilirim?\n\nKVKK Aydınlatma Metni\nhttps://www.onlinevipdershane.com/gizlilik.html'
  );
  const n = buildKvkkNotice('https://k/x');
  assert.match(n, /\nhttps:\/\/k\/x$/);
  assert.doesNotMatch(n, /bot|satış|yapay/i);
});

test('telefon: WhatsApp numara istemez, Instagram bir kez ister', () => {
  const wa = buildDynamicContext({ channel: 'whatsapp', contactPhone: '0532 111 22 33' });
  assert.match(wa, /telefon numarası isteme/);
  const ig = buildDynamicContext({ channel: 'instagram' });
  assert.match(ig, /yalnız bir kez iste/);
  const book = ASSISTANT_TOOLS.find((t) => t.name === 'book_callback');
  assert.ok(!book.input_schema.required.includes('phone'));
});

test('randevu: WhatsApp sohbet numarası telefon ve veli telefonu olarak kullanılır', () => {
  const allowedStarts = ['2026-11-20T10:00:00+03:00'];
  const v = validateBooking(
    { start_iso: allowedStarts[0], student_name: 'Ali', grade: '5', target: 'okul başarısı', is_minor: true, parent_name: 'Ayşe' },
    { allowedStarts, fallbackPhone: '905321112233' }
  );
  assert.equal(v.ok, true);
  assert.equal(v.value.phone, '905321112233');
  assert.equal(v.value.parent_phone, '905321112233');
  const noPhone = validateBooking(
    { start_iso: allowedStarts[0], student_name: 'Ali', grade: '5', target: 'LGS', is_minor: false },
    { allowedStarts }
  );
  assert.equal(noPhone.ok, false);
});

const activeSettings = { is_active: true, schedule: DEFAULT_SCHEDULE, max_bot_replies: 15 };
const conv = { id: 'c1', channel: 'whatsapp', contact_identifier: '905321112233', metadata: {} };

test('çalışma kararı', () => {
  const night = ist('2026-11-19', '22:00');
  const day = ist('2026-11-19', '14:00');
  assert.deepEqual(decideRun({ settings: activeSettings, conversation: conv, now: night }), { run: true, reason: 'ok' });
  assert.equal(decideRun({ settings: { ...activeSettings, is_active: false }, conversation: conv, now: night }).reason, 'module_disabled');
  assert.equal(decideRun({ settings: activeSettings, conversation: conv, now: day }).reason, 'outside_schedule');
  assert.equal(decideRun({ settings: activeSettings, conversation: conv, session: { state: 'handover' }, now: night }).reason, 'human_takeover');
  assert.equal(decideRun({ settings: activeSettings, conversation: { ...conv, is_internal: true }, now: night }).reason, 'internal_contact');
  const ig2 = { ...conv, channel: 'instagram', contact_identifier: '123', metadata: { ig_account_id: '999' } };
  assert.equal(decideRun({ settings: activeSettings, conversation: ig2, now: night }).reason, 'secondary_ig_account');
  assert.equal(decideRun({ settings: { ...activeSettings, primary_ig_only: false }, conversation: ig2, now: night }).run, true);
  assert.equal(decideRun({ settings: activeSettings, conversation: { ...conv, channel: 'facebook' }, now: night }).reason, 'channel_disabled');
  assert.equal(decideRun({ settings: activeSettings, conversation: conv, session: { state: 'active', bot_reply_count: 15 }, now: night }).reason, 'max_replies');
  assert.equal(
    decideRun({ settings: activeSettings, conversation: conv, now: night, lastInboundAt: new Date(night - 25 * 3600000).toISOString() }).reason,
    'window_closed'
  );
});

test('araç döngüsü: araç çağrılır, sonuç geri verilir, son metin döner', async () => {
  const calls = [];
  const responses = [
    {
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'tool_use', id: 't1', name: 'get_available_slots', input: {} }
      ]
    },
    { stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 7 }, content: [{ type: 'text', text: 'Yarın 10:00 uygun mu?' }] }
  ];
  const create = async (params) => {
    calls.push(params);
    return responses.shift();
  };
  const r = await runAssistantLoop({
    create,
    params: { model: 'm', messages: [{ role: 'user', content: 'randevu' }] },
    executeTool: async (name) => (name === 'get_available_slots' ? '[{"start_iso":"x"}]' : '')
  });
  assert.equal(r.text, 'Yarın 10:00 uygun mu?');
  assert.equal(r.usage.input_tokens, 30);
  assert.equal(r.toolCalls[0].name, 'get_available_slots');
  // ikinci istekte asistan içeriği (düşünme blokları dahil) aynen ve araç sonucu var
  const second = calls[1].messages;
  assert.equal(second[1].role, 'assistant');
  assert.equal(second[1].content[0].type, 'thinking');
  assert.deepEqual(second[2].content[0], { type: 'tool_result', tool_use_id: 't1', content: '[{"start_iso":"x"}]' });
});

test('araç döngüsü: araç hatası is_error ile döner, ret metin vermez', async () => {
  const responses = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'book_callback', input: {} }] },
    { stop_reason: 'refusal', content: [] }
  ];
  const seen = [];
  const r = await runAssistantLoop({
    create: async (p) => {
      seen.push(p);
      return responses.shift();
    },
    params: { messages: [{ role: 'user', content: 'x' }] },
    executeTool: async () => {
      throw new Error('olmadı');
    }
  });
  assert.equal(r.stopReason, 'refusal');
  assert.equal(r.text, '');
  assert.equal(seen[1].messages[2].content[0].is_error, true);
});
