/**
 * Kayıt Takibi — ortak yardımcılar (telefon, program, dönüşüm oranı)
 */

export const GRADE_PROGRAMS = [
  { code: 'grade_2', label: '2. Sınıf', sortOrder: 10 },
  { code: 'grade_3', label: '3. Sınıf', sortOrder: 20 },
  { code: 'grade_4', label: '4. Sınıf', sortOrder: 30 },
  { code: 'grade_5', label: '5. Sınıf', sortOrder: 40 },
  { code: 'grade_6', label: '6. Sınıf', sortOrder: 50 },
  { code: 'grade_7', label: '7. Sınıf', sortOrder: 60 },
  { code: 'lgs', label: 'LGS', sortOrder: 70 },
  { code: 'grade_9', label: '9. Sınıf', sortOrder: 80 },
  { code: 'grade_10', label: '10. Sınıf', sortOrder: 90 },
  { code: 'grade_11', label: '11. Sınıf', sortOrder: 100 },
  { code: 'yks', label: 'YKS', sortOrder: 110 },
  { code: 'yos', label: 'YÖS', sortOrder: 120 },
  { code: 'private_lesson', label: 'Özel Ders', sortOrder: 130 }
];

export const GRADE_PROGRAM_LABELS = Object.fromEntries(
  GRADE_PROGRAMS.map((g) => [g.code, g.label])
);

/** Excel / serbest metin → merkezi kod */
const GRADE_ALIASES = [
  [/^(2|2\.?\s*s[ıi]n[iı]f)/i, 'grade_2'],
  [/^(3|3\.?\s*s[ıi]n[iı]f)/i, 'grade_3'],
  [/^(4|4\.?\s*s[ıi]n[iı]f)/i, 'grade_4'],
  [/^(5|5\.?\s*s[ıi]n[iı]f)/i, 'grade_5'],
  [/^(6|6\.?\s*s[ıi]n[iı]f)/i, 'grade_6'],
  [/^(7|7\.?\s*s[ıi]n[iı]f)/i, 'grade_7'],
  [/^lgs$/i, 'lgs'],
  [/^(8|8\.?\s*s[ıi]n[iı]f)/i, 'lgs'],
  [/^(9|9\.?\s*s[ıi]n[iı]f)/i, 'grade_9'],
  [/^(10|10\.?\s*s[ıi]n[iı]f)/i, 'grade_10'],
  [/^(11|11\.?\s*s[ıi]n[iı]f)/i, 'grade_11'],
  [/^yks$/i, 'yks'],
  [/^(12|12\.?\s*s[ıi]n[iı]f)/i, 'yks'],
  [/^y[öo]s$/i, 'yos'],
  [/özel\s*ders/i, 'private_lesson']
];

export function normalizeGradeProgram(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const direct = GRADE_PROGRAMS.find((g) => g.code === s.toLowerCase());
  if (direct) return direct.code;
  const lower = s.toLocaleLowerCase('tr-TR');
  for (const [re, code] of GRADE_ALIASES) {
    if (re.test(lower) || re.test(s)) return code;
  }
  for (const g of GRADE_PROGRAMS) {
    if (g.label.toLocaleLowerCase('tr-TR') === lower) return g.code;
  }
  return s;
}

/** Türkiye telefon normalizasyonu → 05xxxxxxxxx */
export function normalizeTrPhone(raw) {
  if (raw == null || raw === '') return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('90') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith('5')) {
    digits = '0' + digits;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    if (tail.startsWith('5')) return '0' + tail;
  }
  return digits.length >= 10 ? digits : null;
}

/** students.parent_phone farklı formatlarda tutulabildiği için arama varyantları */
export function phoneLookupVariants(raw) {
  const n = normalizeTrPhone(raw);
  if (!n) return [];
  const set = new Set([n]);
  if (n.startsWith('0') && n.length === 11) {
    set.add(n.slice(1));
    set.add(`+90${n.slice(1)}`);
    set.add(`90${n.slice(1)}`);
  }
  return [...set];
}

/** Europe/Istanbul günü → UTC ISO aralığı */
export function istanbulDayBounds(ymd) {
  const d = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return {
    start: new Date(`${d}T00:00:00+03:00`).toISOString(),
    end: new Date(`${d}T23:59:59.999+03:00`).toISOString()
  };
}

export const PRIMARY_STATUSES = ['tracking', 'confirmed', 'lost'];
export const PRIMARY_STATUS_LABELS = {
  tracking: 'Takip',
  confirmed: 'Kesin Kayıt',
  lost: 'Olumsuz/Arşiv'
};

export const STAGES = [
  'new_lead',
  'first_contact_pending',
  'first_contact_completed',
  'presentation_scheduled',
  'trial_lesson_scheduled',
  'trial_lesson_completed',
  'offer_sent',
  'considering',
  'follow_up',
  'payment_pending',
  'postponed',
  'confirmed',
  'lost'
];

export const STAGE_LABELS = {
  new_lead: 'Yeni kayıt adayı',
  first_contact_pending: 'İlk görüşme yapılacak',
  first_contact_completed: 'İlk görüşme yapıldı',
  presentation_scheduled: 'Tanıtım görüşmesi planlandı',
  trial_lesson_scheduled: 'Deneme dersi planlandı',
  trial_lesson_completed: 'Deneme dersi yapıldı',
  offer_sent: 'Program ve fiyat sunuldu',
  considering: 'Veli düşünüyor',
  follow_up: 'Tekrar aranacak',
  payment_pending: 'Ödeme bekleniyor',
  postponed: 'Daha sonra aranacak',
  confirmed: 'Kesin kayıt',
  lost: 'Olumsuz sonuçlandı'
};

export const TEMPERATURES = ['hot', 'warm', 'cold'];
export const TEMPERATURE_LABELS = { hot: 'Sıcak', warm: 'Ilık', cold: 'Soğuk' };

export const LOST_REASONS = [
  'price_high',
  'other_institution',
  'no_online',
  'program_mismatch',
  'schedule_mismatch',
  'unreachable',
  'postponed',
  'info_only',
  'not_interested',
  'other'
];

export const LOST_REASON_LABELS = {
  price_high: 'Ücret yüksek bulundu',
  other_institution: 'Başka kuruma kayıt oldu',
  no_online: 'Online eğitim istemedi',
  program_mismatch: 'Program uygun olmadı',
  schedule_mismatch: 'Ders saatleri uygun olmadı',
  unreachable: 'Veliye ulaşılamadı',
  postponed: 'Şimdilik erteledi',
  info_only: 'Sadece bilgi aldı',
  not_interested: 'Kayıt düşünmüyor',
  other: 'Diğer'
};

export const TASK_TYPES = [
  'call_parent',
  'whatsapp',
  'presentation',
  'trial_lesson_plan',
  'send_program',
  'send_offer',
  'payment_followup',
  'manager_meeting',
  're_evaluate',
  'other'
];

export const TASK_TYPE_LABELS = {
  call_parent: 'Veli aranacak',
  whatsapp: 'WhatsApp mesajı gönderilecek',
  presentation: 'Tanıtım görüşmesi yapılacak',
  trial_lesson_plan: 'Deneme dersi planlanacak',
  send_program: 'Program gönderilecek',
  send_offer: 'Fiyat teklifi gönderilecek',
  payment_followup: 'Ödeme için aranacak',
  manager_meeting: 'Yönetici görüşmesi yapılacak',
  re_evaluate: 'Tekrar değerlendirilecek',
  other: 'Diğer'
};

export const TRACKING_STAGES = STAGES.filter((s) => s !== 'confirmed' && s !== 'lost');

/**
 * Kayıt dönüşüm oranı:
 * confirmed / (confirmed + lost + active tracking)
 */
export function computeConversionRate(leads, { excludeImported = true } = {}) {
  const pool = (leads || []).filter((l) => {
    if (l.deleted_at) return false;
    if (excludeImported && l.source === 'excel_import_archive') return false;
    return true;
  });
  const confirmed = pool.filter((l) => l.primary_status === 'confirmed').length;
  const lost = pool.filter((l) => l.primary_status === 'lost').length;
  const tracking = pool.filter((l) => l.primary_status === 'tracking').length;
  const denominator = confirmed + lost + tracking;
  if (denominator === 0) return { rate: 0, confirmed, lost, tracking, denominator: 0 };
  return {
    rate: Math.round((confirmed / denominator) * 1000) / 10,
    confirmed,
    lost,
    tracking,
    denominator
  };
}

export function isOverdue(nextActionAt, now = new Date()) {
  if (!nextActionAt) return false;
  const d = new Date(nextActionAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

export function splitFullName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

export function buildDuplicateKey(lead) {
  return [
    lead.institution_id,
    lead.academic_period_key || '',
    String(lead.full_name || `${lead.first_name} ${lead.last_name}`).toLocaleLowerCase('tr-TR').trim(),
    lead.normalized_phone || '',
    lead.grade_program || ''
  ].join('|');
}

export const ISTANBUL_TZ = 'Europe/Istanbul';

export function formatIstanbul(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: ISTANBUL_TZ,
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}
