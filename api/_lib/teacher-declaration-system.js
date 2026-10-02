/**
 * Beyanla karşılaştırılacak SİSTEM kayıtları.
 *
 * Ders sayısı, hakediş modülüyle aynı birimle sayılır: 40 dakikalık ders
 * birimi (`class-lesson-payment-units.js`). İki modül farklı birim kullansa
 * ekranda tutan rakam hakedişte tutmaz, öğretmenle tartışma çıkar.
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

/**
 * Bir öğretmenin dönemdeki sistem kayıtları.
 *
 * @returns {Promise<{
 *   totals: { group:number, private:number, guidance:number },
 *   rows: Array<{kind,class_id,student_id,label,quantity}>,
 *   unassigned: { count:number, units:number }
 * }>}
 */
export async function loadTeacherSystemWork({ teacherId, period, institutionId = null }) {
  const range = periodRange(period);
  const empty = {
    totals: { group: 0, private: 0, guidance: 0 },
    rows: [],
    unassigned: { count: 0, units: 0 }
  };
  if (!teacherId || !range) return empty;

  const totals = { group: 0, private: 0, guidance: 0 };
  /** @type {Map<string, {kind:string,class_id:string|null,student_id:string|null,label:string,quantity:number}>} */
  const rows = new Map();
  const add = (kind, refKey, label, qty, extra) => {
    const k = `${kind}|${refKey}`;
    if (!rows.has(k)) rows.set(k, { kind, class_id: null, student_id: null, label, quantity: 0, ...extra });
    const cur = rows.get(k);
    cur.quantity = roundUnits(cur.quantity + qty);
    if (!cur.label && label) cur.label = label;
  };

  // --- Grup dersleri ve rehberlik ---
  let sq = supabaseAdmin
    .from('class_sessions')
    .select('id, class_id, teacher_id, lesson_date, start_time, end_time, subject, status, institution_id')
    .eq('status', 'completed')
    .eq('teacher_id', teacherId)
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(5000);
  if (institutionId) sq = sq.eq('institution_id', institutionId);
  const { data: sessions, error: se } = await sq;
  if (se) throw se;

  const classIds = [...new Set((sessions || []).map((s) => s.class_id).filter(Boolean))];
  let classNames = {};
  if (classIds.length) {
    const { data: cls } = await supabaseAdmin.from('classes').select('id, name').in('id', classIds);
    classNames = Object.fromEntries((cls || []).map((c) => [String(c.id), c.name || '']));
  }

  for (const s of sessions || []) {
    const units = sessionLessonUnits40(s);
    const kind = isGuidanceSubject(s.subject) ? 'guidance' : 'group';
    totals[kind] = roundUnits(totals[kind] + units);
    const ref = String(s.class_id || 'sinifsiz');
    add(kind, ref, classNames[String(s.class_id)] || 'Sınıf belirtilmemiş', units, {
      class_id: s.class_id || null
    });
  }

  // --- Özel dersler ---
  let pq = supabaseAdmin
    .from('teacher_lessons')
    .select('id, teacher_id, student_id, lesson_date, start_time, end_time, duration_minutes, status, institution_id')
    .eq('status', 'completed')
    .eq('teacher_id', teacherId)
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(5000);
  if (institutionId) pq = pq.eq('institution_id', institutionId);
  const { data: privates, error: pe } = await pq;
  // Tablo yoksa özel ders sıfır kalır, modül yine çalışır
  if (pe && !/does not exist|schema cache|PGRST205/i.test(errorMessage(pe))) throw pe;

  const studentIds = [...new Set((privates || []).map((p) => p.student_id).filter(Boolean))];
  let studentNames = {};
  if (studentIds.length) {
    const { data: st } = await supabaseAdmin.from('students').select('id, name').in('id', studentIds);
    studentNames = Object.fromEntries((st || []).map((s) => [String(s.id), s.name || '']));
  }

  for (const p of privates || []) {
    const units = privateUnits(p);
    totals.private = roundUnits(totals.private + units);
    add('private', String(p.student_id || 'ogrencisiz'), studentNames[String(p.student_id)] || 'Öğrenci belirtilmemiş', units, {
      student_id: p.student_id || null
    });
  }

  // --- Öğretmeni atanmamış dersler ---
  // Bu dersler hiçbir öğretmene sayılmıyor; sistem toplamı beyandan düşük
  // çıkıyor. Sessizce yutmak yerine yöneticiye ayrı uyarı olarak gösterilir.
  let uq = supabaseAdmin
    .from('class_sessions')
    .select('id, start_time, end_time, lesson_date, status, institution_id, teacher_id')
    .eq('status', 'completed')
    .is('teacher_id', null)
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(5000);
  if (institutionId) uq = uq.eq('institution_id', institutionId);
  const { data: orphan } = await uq;
  const unassigned = {
    count: (orphan || []).length,
    units: roundUnits((orphan || []).reduce((a, s) => a + sessionLessonUnits40(s), 0))
  };

  return { totals, rows: [...rows.values()], unassigned };
}
