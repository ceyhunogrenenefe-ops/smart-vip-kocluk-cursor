/**
 * Özel ders saatleri — teacher_lessons tamamlanan kayıtlardan (hakediş ile aynı birim mantığı).
 * Salt okuma; hakediş tablolarına yazmaz.
 */
import {
  GROUP_LESSON_UNIT_MINUTES,
  roundUnits,
  sessionLessonUnits40
} from './class-lesson-payment-units.js';
import { errorMessage } from './error-msg.js';

export function privateLessonUnitsFromRow(row) {
  const dm = row?.duration_minutes != null ? Number(row.duration_minutes) : NaN;
  if (Number.isFinite(dm) && dm > 0) {
    return roundUnits(dm / GROUP_LESSON_UNIT_MINUTES);
  }
  return sessionLessonUnits40(row);
}

/** 40 dk birim → saat */
export function unitsToHours(units) {
  return roundUnits((Number(units) || 0) * (GROUP_LESSON_UNIT_MINUTES / 60));
}

export function monthBoundsYm(ym) {
  const raw = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split('-').map((x) => parseInt(x, 10));
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${raw}-01`,
    to: `${raw}-${String(last).padStart(2, '0')}`
  };
}

/**
 * @returns {Promise<Map<string, { system_hours: number, teachers: Map<string, { teacher_id: string, hours: number }> }>>}
 */
export async function scanPrivateLessonHoursByStudent({ supabase, from, to, institutionId }) {
  let q = supabase
    .from('teacher_lessons')
    .select(
      'id,teacher_id,student_id,duration_minutes,start_time,end_time,lesson_date,status,institution_id'
    )
    .eq('status', 'completed')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .limit(8000);
  if (institutionId) q = q.eq('institution_id', institutionId);

  const { data, error } = await q;
  if (error) {
    if (/teacher_lessons|does not exist|schema cache|PGRST205/i.test(errorMessage(error))) {
      return new Map();
    }
    throw error;
  }

  const byStudent = new Map();
  for (const row of data || []) {
    const sid = String(row.student_id || '').trim();
    const tid = String(row.teacher_id || '').trim();
    if (!sid) continue;
    const units = privateLessonUnitsFromRow(row);
    const hours = unitsToHours(units);
    if (!byStudent.has(sid)) {
      // `lessons`: satır satır döküm — öğrenciye tıklayınca hangi derslerin
      // sayıldığı görülebilsin
      byStudent.set(sid, { system_hours: 0, teachers: new Map(), lessons: [] });
    }
    const cur = byStudent.get(sid);
    cur.lessons.push({
      id: row.id,
      teacher_id: tid || null,
      lesson_date: row.lesson_date || null,
      duration_minutes: row.duration_minutes ?? null,
      hours
    });
    cur.system_hours = roundUnits(cur.system_hours + hours);
    if (tid) {
      const t = cur.teachers.get(tid) || { teacher_id: tid, hours: 0 };
      t.hours = roundUnits(t.hours + hours);
      cur.teachers.set(tid, t);
    }
  }
  return byStudent;
}

/**
 * Öğretmen beyanlarından özel ders saatleri.
 *
 * Öğretmen aylık formunda "Öykü – 4 ders" diye öğrenci bazında özel ders
 * bildiriyor. Ders kaydı sisteme girilmemiş olsa bile veliden alınacak ücret
 * bu beyandan hesaplanabilsin diye okunur.
 *
 * Beyan ders ADEDİ olarak girilir; ücretlendirme saat üzerinden yapıldığı
 * için 40 dakikalık ders birimi saate çevrilir — hakediş ve beyan ekranıyla
 * aynı kural.
 *
 * Yalnız GÖNDERİLMİŞ beyanlar sayılır; yarım kalan form ücreti etkilemesin.
 *
 * @returns {Promise<Map<string, { declared_hours: number, teachers: Map<string, {teacher_id:string, hours:number}> }>>}
 */
export async function scanDeclaredPrivateHoursByStudent({ supabase, from, to, institutionId }) {
  const out = new Map();
  try {
    // Dönem ayları: 'YYYY-MM-01' listesi
    const aylar = new Set();
    const ilk = new Date(`${String(from).slice(0, 7)}-01T00:00:00Z`);
    const son = new Date(`${String(to).slice(0, 7)}-01T00:00:00Z`);
    for (let d = new Date(ilk); d <= son; d.setUTCMonth(d.getUTCMonth() + 1)) {
      aylar.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`);
    }
    if (!aylar.size) return out;

    let dq = supabase
      .from('teacher_month_declarations')
      .select('id, teacher_id, period_month, status, institution_id')
      .in('period_month', [...aylar])
      .in('status', ['submitted', 'reopened'])
      .limit(1000);
    if (institutionId) dq = dq.eq('institution_id', institutionId);
    const { data: decls, error } = await dq;
    if (error || !decls?.length) return out;

    const byDecl = new Map((decls || []).map((d) => [String(d.id), d]));
    const { data: lines } = await supabase
      .from('teacher_declaration_lines')
      .select('declaration_id, kind, student_id, quantity, note')
      .in('declaration_id', [...byDecl.keys()])
      .eq('kind', 'private')
      .limit(5000);

    for (const l of lines || []) {
      const sid = String(l.student_id || '').trim();
      if (!sid) continue;
      const adet = Number(l.quantity);
      if (!Number.isFinite(adet) || adet <= 0) continue;
      const hours = unitsToHours(adet);
      const tid = String(byDecl.get(String(l.declaration_id))?.teacher_id || '').trim();

      if (!out.has(sid)) out.set(sid, { declared_hours: 0, teachers: new Map(), lines: [] });
      const cur = out.get(sid);
      cur.lines.push({
        teacher_id: tid || null,
        period_month: byDecl.get(String(l.declaration_id))?.period_month || null,
        quantity: adet,
        hours,
        note: l.note || null
      });
      cur.declared_hours = roundUnits(cur.declared_hours + hours);
      if (tid) {
        const t = cur.teachers.get(tid) || { teacher_id: tid, hours: 0 };
        t.hours = roundUnits(t.hours + hours);
        cur.teachers.set(tid, t);
      }
    }
  } catch (e) {
    // Beyan modülü yoksa ücret ekranı eskisi gibi çalışsın
    console.warn('[private-lesson-fees] beyan saatleri:', errorMessage(e));
  }
  return out;
}
