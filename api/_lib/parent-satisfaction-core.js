/**
 * Veli Memnuniyet ve Takip — saf mantık (veritabanı / ağ yok).
 *
 * Anket soruları, seçenekleri ve arama durumu türetimi burada. Durum ayrı bir
 * kolonda TUTULMAZ: her görüşme ayrı satır olduğu için öğrencinin güncel
 * durumu son görüşmeden hesaplanır. Böylece geçmiş hiç bozulmaz.
 */

export const CALL_RESULTS = [
  { id: 'completed', label: 'Görüşme Tamamlandı' },
  { id: 'unreachable', label: 'Veliye Ulaşılamadı' },
  { id: 'call_later', label: 'Daha Sonra Aranacak' },
  { id: 'phone_off', label: 'Telefon Kapalı' },
  { id: 'wrong_number', label: 'Yanlış / Eksik Telefon' }
];

/** Listede gösterilen arama durumu. */
export const CALL_STATUSES = [
  { id: 'pending', label: 'Aranacak', dot: '🟡' },
  { id: 'call_later', label: 'Arandı – Tekrar Aranacak', dot: '🔵' },
  { id: 'completed', label: 'Görüşme Tamamlandı', dot: '🟢' },
  { id: 'unreachable', label: 'Ulaşılamadı', dot: '🔴' },
  { id: 'action', label: 'Aksiyon Gerekiyor', dot: '🟠' }
];

export const SURVEY_QUESTIONS = [
  {
    id: 'q_lessons',
    title: 'Ders ve etüt süreci',
    text:
      'Öğrencimizin canlı ders ve etüt katılımları nasıl gidiyor; derslerin işleyişinden ve veriminden memnun musunuz?',
    noteLabel: 'Özel Not / Aksiyon',
    noteField: 'q_lessons_note',
    options: [
      { id: 'very_satisfied', label: 'Çok Memnun' },
      { id: 'satisfied', label: 'Memnun' },
      { id: 'partly', label: 'Kısmen Memnun' },
      { id: 'unsatisfied', label: 'Memnun Değil' }
    ]
  },
  {
    id: 'q_coach',
    title: 'Eğitim koçluğu',
    text:
      'Eğitim koçunuzla iletişiminiz ve görüşme sıklığınızdan memnun musunuz, öğrencimizin gelişim takibi düzenli yapılıyor mu?',
    noteLabel: 'Özel Not / Aksiyon',
    noteField: 'q_coach_note',
    options: [
      { id: 'very_regular', label: 'Çok Düzenli' },
      { id: 'enough', label: 'Yeterli' },
      { id: 'insufficient', label: 'Yetersiz / Seyrek' },
      { id: 'unreachable', label: 'Ulaşılamıyor' }
    ]
  },
  {
    id: 'q_tech',
    title: 'Teknik altyapı',
    text:
      'Canlı derslere veya etütlere katılırken platforma giriş, internet bağlantısı veya ses/görüntü tarafında herhangi bir teknik aksaklık yaşıyor musunuz?',
    noteLabel: 'Teknik Not / Aksiyon',
    noteField: 'q_tech_note',
    options: [
      { id: 'fine', label: 'Sorunsuz' },
      { id: 'sometimes', label: 'Ara Sıra Sorun Yaşanıyor' },
      { id: 'serious', label: 'Ciddi Teknik Sorun Var' }
    ]
  },
  {
    id: 'q_recommend',
    title: 'Genel memnuniyet ve tavsiye',
    text:
      'Genel olarak aldığınız eğitim hizmetinden memnun musunuz; eğitimimizi yakın çevrenize, akraba veya okul arkadaşlarınıza tavsiye eder misiniz?',
    options: [
      { id: 'definitely', label: 'Kesinlikle Tavsiye Ederim' },
      { id: 'maybe', label: 'Edebilirim' },
      { id: 'undecided', label: 'Kararsızım' },
      { id: 'no', label: 'Tavsiye Etmem' }
    ]
  }
];

export const ACTION_TYPES = [
  { id: 'coach_followup', label: 'Eğitim koçu dönüş yapacak' },
  { id: 'teacher_meeting', label: 'Öğretmenle görüşülecek' },
  { id: 'tech_support', label: 'Teknik destek' },
  { id: 'schedule_problem', label: 'Ders programı / saat problemi' },
  { id: 'absence_problem', label: 'Devamsızlık problemi' },
  { id: 'academic_dissatisfaction', label: 'Akademik memnuniyetsizlik' },
  { id: 'manager_followup', label: 'Yönetici dönüşü gerekiyor' },
  { id: 'other', label: 'Diğer' }
];

/** Referans alanı yalnız olumlu tavsiye yanıtlarında açılır. */
export function recommendOpensReferral(value) {
  return value === 'definitely' || value === 'maybe';
}

/**
 * Öğrencinin güncel arama durumu — son görüşmeden türetilir.
 * @param {object|null} lastSurvey en yeni parent_call_surveys satırı
 */
export function deriveCallStatus(lastSurvey) {
  if (!lastSurvey) return 'pending';
  if (lastSurvey.action_required && !lastSurvey.action_done_at) return 'action';
  const r = String(lastSurvey.call_result || '');
  if (r === 'completed') return 'completed';
  if (r === 'call_later') return 'call_later';
  if (r === 'unreachable' || r === 'phone_off' || r === 'wrong_number') return 'unreachable';
  return 'pending';
}

export function callStatusLabel(id) {
  return CALL_STATUSES.find((s) => s.id === id)?.label || 'Aranacak';
}

/** Giriş cümlesi — veli ve öğrenci adı sistemden dolar. */
export function buildOpeningLine({ parentName, studentName }) {
  const veli = String(parentName || '').trim() || 'Değerli velimiz';
  const ogrenci = String(studentName || '').trim() || 'öğrencimiz';
  return (
    `Merhabalar ${veli}, ben Online VIP Dershane yönetiminden arıyorum. ` +
    `Öğrencimiz ${ogrenci}'nın ders ve gelişim sürecini yakından takip etmek, ` +
    'kurum olarak sizlerin genel memnuniyetini değerlendirmek adına kısa bir arama ' +
    'gerçekleştirmek istedim. Müsaitseniz birkaç kısa sorum olacaktı.'
  );
}

export const CLOSING_LINE =
  'Geri bildirimleriniz bizim için çok kıymetli. Herhangi bir ihtiyacınızda veya talebinizde ' +
  'bizlere doğrudan ulaşabilirsiniz. Öğrencimize derslerinde başarılar dileriz.';

/** Yönetici kartları — satır listesinden sayılır. */
export function summarizeCalls(rows) {
  const out = {
    total: 0,
    pending: 0,
    called: 0,
    completed: 0,
    unreachable: 0,
    call_later: 0,
    action: 0,
    referral: 0
  };
  for (const r of rows || []) {
    out.total += 1;
    const st = r.call_status || 'pending';
    if (st === 'pending') out.pending += 1;
    else out.called += 1;
    if (st === 'completed') out.completed += 1;
    if (st === 'unreachable') out.unreachable += 1;
    if (st === 'call_later') out.call_later += 1;
    if (st === 'action') out.action += 1;
    if (r.has_referral) out.referral += 1;
  }
  return out;
}

/** Temsilci bazlı tablo. */
export function summarizeByAgent(rows, nameById = {}) {
  const map = new Map();
  for (const r of rows || []) {
    const id = r.agent_user_id || '_unassigned';
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: id === '_unassigned' ? 'Atanmamış' : nameById[id] || 'Temsilci',
        assigned: 0,
        called: 0,
        completed: 0,
        unreachable: 0,
        action: 0
      });
    }
    const a = map.get(id);
    a.assigned += 1;
    const st = r.call_status || 'pending';
    if (st !== 'pending') a.called += 1;
    if (st === 'completed') a.completed += 1;
    if (st === 'unreachable') a.unreachable += 1;
    if (st === 'action') a.action += 1;
  }
  return [...map.values()].sort((a, b) => b.assigned - a.assigned);
}
