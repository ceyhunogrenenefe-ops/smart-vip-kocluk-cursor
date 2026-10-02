/**
 * Beyanla karşılaştırılacak SİSTEM kayıtları.
 *
 * Ders sayısı, hakediş modülüyle aynı birimle sayılır: 40 dakikalık ders
 * birimi (`class-lesson-payment-units.js`). İki modül farklı birim kullansa
 * ekranda tutan rakam hakedişte tutmaz, öğretmenle tartışma çıkar.
 *
 * Tarama TOPLU yapılır: öğretmen başına ayrı sorgu atmak 48 kişilik listede
 * yüzlerce gidiş-dönüş demekti ve sayfa geç açılıyordu. Artık dönemin bütün
 * kayıtları birkaç sorguyla çekilip bellekte öğretmenlere dağıtılır.
 *
 * Yalnız OKUR; hiçbir ders kaydına dokunmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { GROUP_LESSON_UNIT_MINUTES, roundUnits, sessionLessonUnits40 } from './class-lesson-payment-units.js';
import { periodRange } from './teacher-declaration-core.js';

/** Konusu rehberlik olan grup oturumları ayrı sayılır (hakediş ile aynı kural). */
function isGuidanceSubject(subject) {
  const s = String(subject || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return s.includes('rehber') || s.includes('kocluk') || s.includes('guidance') || s.includes('coach');
}

function privateUnits(row) {
  const dm = row?.duration_minutes != null ? Number(row.duration_minutes) : NaN;
  if (Number.isFinite(dm) && dm > 0) return roundUnits(dm / GROUP_LESSON_UNIT_MINUTES);
  return sessionLessonUnits40(row);
}

function emptyWork() {
  return {
    totals: { group: 0, private: 0, guidance: 0 },
    rows: [],
    unassigned: { count: 0, units: 0 }
  };
}

/**
 * Dönemin bütün sistem kayıtlarını bir kerede tarar.
 *
 * @param {{ period: string, teacherIds?: string[]|null, institutionId?: string|null }} args
 * @returns {Promise<Map<string, ReturnType<typeof emptyWork>>>}
 */
export async function loadTeacherSystemWorkBatch({ period, teacherIds = null, institutionId = null }) {
  const range = periodRange(period);
  const out = new Map();
  if (!range) return out;

  const ids = Array.isArray(teacherIds) && teacherIds.length ? [...new Set(teacherIds.map(String))] : null;

  // --- Grup dersleri ve rehberlik ---
  let sq = supabaseAdmin
    .from('class_sessions')
    .select('id, class_id, teacher_id, lesson_date, start_time, end_time, subject, status, institution_id')
    .eq('status', 'completed')
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(20000);
  if (institutionId) sq = sq.eq('institution_id', institutionId);
  const { data: sessions, error: se } = await sq;
  if (se) throw se;

  // --- Özel dersler ---
  let pq = supabaseAdmin
    .from('teacher_lessons')
    .select('id, teacher_id, student_id, lesson_date, start_time, end_time, duration_minutes, status, institution_id')
    .eq('status', 'completed')
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(20000);
  if (institutionId) pq = pq.eq('institution_id', institutionId);
  const { data: privates, error: pe } = await pq;
  // Tablo yoksa özel ders sıfır kalır, modül yine çalışır
  if (pe && !/does not exist|schema cache|PGRST205/i.test(errorMessage(pe))) throw pe;

  // --- Ad çözümleri: sınıf ve öğrenci adları tek seferde ---
  const classIds = [...new Set((sessions || []).map((s) => s.class_id).filter(Boolean))];
  const studentIds = [...new Set((privates || []).map((p) => p.student_id).filter(Boolean))];
  const [clsRes, stuRes] = await Promise.all([
    classIds.length
      ? supabaseAdmin.from('classes').select('id, name').in('id', classIds.slice(0, 1000))
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabaseAdmin.from('students').select('id, name').in('id', studentIds.slice(0, 1000))
      : Promise.resolve({ data: [] })
  ]);
  const classNames = Object.fromEntries((clsRes.data || []).map((c) => [String(c.id), c.name || '']));
  const studentNames = Object.fromEntries((stuRes.data || []).map((s) => [String(s.id), s.name || '']));

  const ensure = (tid) => {
    const id = String(tid || '').trim();
    if (!id) return null;
    if (!out.has(id)) out.set(id, { ...emptyWork(), _rows: new Map() });
    return out.get(id);
  };
  const addRow = (bucket, kind, refKey, label, qty, extra) => {
    const k = `${kind}|${refKey}`;
    if (!bucket._rows.has(k)) {
      bucket._rows.set(k, { kind, class_id: null, student_id: null, label, quantity: 0, ...extra });
    }
    const cur = bucket._rows.get(k);
    cur.quantity = roundUnits(cur.quantity + qty);
    if (!cur.label && label) cur.label = label;
  };

  // Öğretmeni atanmamış dersler kuruma göre ortaktır; her öğretmen için
  // yeniden sorgulanmasına gerek yok
  const unassignedRows = (sessions || []).filter((s) => !s.teacher_id);
  const unassigned = {
    count: unassignedRows.length,
    units: roundUnits(unassignedRows.reduce((a, s) => a + sessionLessonUnits40(s), 0))
  };

  for (const s of sessions || []) {
    if (!s.teacher_id) continue;
    if (ids && !ids.includes(String(s.teacher_id))) continue;
    const bucket = ensure(s.teacher_id);
    if (!bucket) continue;
    const units = sessionLessonUnits40(s);
    const kind = isGuidanceSubject(s.subject) ? 'guidance' : 'group';
    bucket.totals[kind] = roundUnits(bucket.totals[kind] + units);
    addRow(bucket, kind, String(s.class_id || 'sinifsiz'), classNames[String(s.class_id)] || 'Sınıf belirtilmemiş', units, {
      class_id: s.class_id || null
    });
  }

  for (const p of privates || []) {
    if (!p.teacher_id) continue;
    if (ids && !ids.includes(String(p.teacher_id))) continue;
    const bucket = ensure(p.teacher_id);
    if (!bucket) continue;
    const units = privateUnits(p);
    bucket.totals.private = roundUnits(bucket.totals.private + units);
    addRow(bucket, 'private', String(p.student_id || 'ogrencisiz'), studentNames[String(p.student_id)] || 'Öğrenci belirtilmemiş', units, {
      student_id: p.student_id || null
    });
  }

  // İstenen her öğretmen için kayıt bulunsun; hiç dersi olmayan da listede
  // sıfırla görünsün
  for (const id of ids || []) ensure(id);

  for (const bucket of out.values()) {
    bucket.rows = [...bucket._rows.values()];
    delete bucket._rows;
    bucket.unassigned = unassigned;
  }
  return out;
}

/**
 * Tek öğretmenin dönemdeki sistem kayıtları.
 * Toplu tarayıcının üstünde durur; iki ayrı sayma kuralı olmasın.
 */
export async function loadTeacherSystemWork({ teacherId, period, institutionId = null }) {
  if (!teacherId) return emptyWork();
  const map = await loadTeacherSystemWorkBatch({
    period,
    teacherIds: [teacherId],
    institutionId
  });
  return map.get(String(teacherId)) || emptyWork();
}
