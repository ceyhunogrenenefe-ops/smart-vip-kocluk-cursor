/**
 * Özel ders adetleri — teacher_lessons tamamlanan kayıtlardan (hakediş ile aynı birim).
 * Salt okuma; hakediş tablolarına yazmaz.
 *
 * ÖLÇÜ BİRİMİ: ders adedi (1 ders = LESSON_DURATION_MINUTES = 40 dakika).
 * Önceden burada 40 dakikalık birim "saate" çevriliyordu (× 40/60); bu yüzden
 * 80 dakikalık ders ekranda 1,33 saat görünüyor ve birim ücretle çarpılınca
 * veliye 2 ders yerine 1,33 ders fiyatı çıkıyordu. Artık çevrim yok:
 * 80 dk → 2 ders → 2 × birim ücret.
 *
 * Alan adlarında `*_hours` geçmesi eski dağıtımlardaki (mobil paket) ekranlar
 * bozulmasın diyedir; taşıdıkları değer ders adedidir.
 */
import {
  LESSON_DURATION_MINUTES,
  roundUnits,
  sessionLessonUnits40
} from './class-lesson-payment-units.js';
import { errorMessage } from './error-msg.js';

/** Bir ders kaydının ders adedi. 80 dk → 2. */
export function privateLessonUnitsFromRow(row) {
  const dm = row?.duration_minutes != null ? Number(row.duration_minutes) : NaN;
  if (Number.isFinite(dm) && dm > 0) {
    return roundUnits(dm / LESSON_DURATION_MINUTES);
  }
  // Süre yazılmamışsa başlangıç–bitiş saatinden hesaplanır
  return sessionLessonUnits40(row);
}

/** Ders adedi → dakika. Raporda "toplam süre" yazmak için. */
export function unitsToMinutes(units) {
  return Math.round((Number(units) || 0) * LESSON_DURATION_MINUTES);
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
 * Değerler DERS ADEDİ cinsindendir (1 ders = 40 dk).
 * @returns {Promise<Map<string, { system_hours: number, teachers: Map<string, { teacher_id: string, hours: number }> }>>}
 */
export async function scanPrivateLessonHoursByStudent({ supabase, from, to, institutionId }) {
  let q = supabase
    .from('teacher_lessons')
    .select(
      'id,teacher_id,student_id,title,duration_minutes,start_time,end_time,lesson_date,status,institution_id'
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
    // Ders adedi — saate çevrilmez
    const units = privateLessonUnitsFromRow(row);
    if (!byStudent.has(sid)) {
      // `lessons`: satır satır döküm — öğrenciye tıklayınca hangi derslerin
      // sayıldığı görülebilsin
      byStudent.set(sid, { system_hours: 0, teachers: new Map(), lessons: [] });
    }
    const cur = byStudent.get(sid);
    cur.lessons.push({
      id: row.id,
      teacher_id: tid || null,
      title: row.title || null,
      lesson_date: row.lesson_date || null,
      // Rapor: başlangıç, bitiş, toplam süre ve hesaplanan ders adedi ayrı ayrı
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
      end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
      duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : unitsToMinutes(units),
      units,
      hours: units
    });
    cur.system_hours = roundUnits(cur.system_hours + units);
    if (tid) {
      const t = cur.teachers.get(tid) || { teacher_id: tid, hours: 0 };
      t.hours = roundUnits(t.hours + units);
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
 * Beyan ders ADEDİ olarak girilir ve ücretlendirme de ders adedi üzerinden
 * yapılır; arada hiçbir çevrim yoktur — hakediş ekranıyla aynı birim.
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
      // Beyan zaten ders adedi; çevrilmez
      const units = roundUnits(adet);
      const tid = String(byDecl.get(String(l.declaration_id))?.teacher_id || '').trim();

      if (!out.has(sid)) out.set(sid, { declared_hours: 0, teachers: new Map(), lines: [] });
      const cur = out.get(sid);
      cur.lines.push({
        teacher_id: tid || null,
        period_month: byDecl.get(String(l.declaration_id))?.period_month || null,
        quantity: adet,
        units,
        duration_minutes: unitsToMinutes(units),
        hours: units,
        note: l.note || null
      });
      cur.declared_hours = roundUnits(cur.declared_hours + units);
      if (tid) {
        const t = cur.teachers.get(tid) || { teacher_id: tid, hours: 0 };
        t.hours = roundUnits(t.hours + units);
        cur.teachers.set(tid, t);
      }
    }
  } catch (e) {
    // Beyan modülü yoksa ücret ekranı eskisi gibi çalışsın
    console.warn('[private-lesson-fees] beyan saatleri:', errorMessage(e));
  }
  return out;
}
