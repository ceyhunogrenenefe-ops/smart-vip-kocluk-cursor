/**
 * YILDIZLAR YKS GRUBU — akşam programı (Salı–Cuma).
 * Kaynak: kurum görsel program (1–4. ders 17:50–21:00). Pazartesi boş.
 *
 * day_of_week: 1=Pazartesi … 7=Pazar
 */

/** @typedef {{ day_of_week: number, start_time: string, end_time: string, subject: string, duration_minutes: number, teacher_key: string }} SlotDef */

export const YKS_YILDIZLAR_CLASS_MATCHERS = [
  'YILDIZLAR YKS GRUBU',
  'YILDIZLAR YKS',
  'YKS YILDIZLAR'
];

/** Görseldeki öğretmenler → users.id (kurum canlı veri) */
export const YKS_YILDIZLAR_TEACHERS = {
  YILMAZ_ISIK: '3cb5dfcf-2080-4aa8-8338-14bf4e0b95f2',
  ALI_AKTAS: 'c93d4093-cd44-46ab-86e4-dc4f27443f2f',
  TAYYIBE: 'f1b44f0a-5c61-4b72-b45a-4bc0615f8be0',
  NURULLAH: '17bc8392-cad2-493e-b1ab-3aef66d14f69',
  YASIN: 'b2debf3b-5077-4d01-a3de-addaf9a1ef99'
};

/**
 * @param {number} day
 * @param {Array<{ start: string, end: string, subject: string, teacher_key: string }>} lessons
 * @returns {SlotDef[]}
 */
function weekday(day, lessons) {
  /** @type {SlotDef[]} */
  const out = [];
  for (const l of lessons) {
    if (!l?.subject) continue;
    const start = `${l.start}:00`;
    const end = `${l.end}:00`;
    const [sh, sm] = l.start.split(':').map(Number);
    const [eh, em] = l.end.split(':').map(Number);
    const duration_minutes = Math.max(15, eh * 60 + em - (sh * 60 + sm));
    out.push({
      day_of_week: day,
      start_time: start,
      end_time: end,
      subject: l.subject,
      duration_minutes,
      teacher_key: l.teacher_key
    });
  }
  return out;
}

/**
 * Salı–Cuma akşam (görsel). S.Ç → SORU ÇÖZÜM (mevcut isimlendirme + çözüm dersi kuralları).
 * Ardışık aynı branş dilimleri BBB oda paylaşımı için peş peşe bırakıldı.
 *
 * Fizik ↔ Biyoloji yer değişimi (işaretli dilimler):
 * - Çarşamba 17:50–19:20 → FİZİK (Ali)
 * - Salı 19:30–21:00 → BİYOLOJİ (Tayyibe)
 */
export const YKS_YILDIZLAR_EVENING_SCHEDULE = [
  // Salı
  ...weekday(2, [
    { start: '17:50', end: '18:30', subject: 'MATEMATİK', teacher_key: 'YILMAZ_ISIK' },
    { start: '18:40', end: '19:20', subject: 'MATEMATİK', teacher_key: 'YILMAZ_ISIK' },
    { start: '19:30', end: '20:10', subject: 'BİYOLOJİ', teacher_key: 'TAYYIBE' },
    { start: '20:20', end: '21:00', subject: 'BİYOLOJİ', teacher_key: 'TAYYIBE' }
  ]),
  // Çarşamba
  ...weekday(3, [
    { start: '17:50', end: '18:30', subject: 'FİZİK', teacher_key: 'ALI_AKTAS' },
    { start: '18:40', end: '19:20', subject: 'FİZİK', teacher_key: 'ALI_AKTAS' },
    { start: '19:30', end: '20:10', subject: 'GEOMETRİ', teacher_key: 'NURULLAH' },
    { start: '20:20', end: '21:00', subject: 'GEOMETRİ', teacher_key: 'NURULLAH' }
  ]),
  // Perşembe
  ...weekday(4, [
    { start: '17:50', end: '18:30', subject: 'KİMYA', teacher_key: 'YASIN' },
    { start: '18:40', end: '19:20', subject: 'KİMYA', teacher_key: 'YASIN' },
    { start: '19:30', end: '20:10', subject: 'MATEMATİK', teacher_key: 'YILMAZ_ISIK' },
    { start: '20:20', end: '21:00', subject: 'MATEMATİK', teacher_key: 'YILMAZ_ISIK' }
  ]),
  // Cuma
  ...weekday(5, [
    { start: '17:50', end: '18:30', subject: 'FİZİK', teacher_key: 'ALI_AKTAS' },
    { start: '18:40', end: '19:20', subject: 'SORU ÇÖZÜM KİMYA', teacher_key: 'YASIN' },
    { start: '19:30', end: '20:10', subject: 'SORU ÇÖZÜM FİZİK', teacher_key: 'ALI_AKTAS' },
    { start: '20:20', end: '21:00', subject: 'MATEMATİK', teacher_key: 'YILMAZ_ISIK' }
  ])
];
