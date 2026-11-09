/**
 * Deneme Kulübü sınav bildirimleri — kayıt, katılım, karne ve WhatsApp.
 * Toplu gönderim yalnız settings.enabled iken yapılır.
 */
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString, addCalendarDaysYmd } from './istanbul-time.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendPlainViaMessageService } from './message-service.js';
import { isMissingTableError } from './supabase-schema.js';
import {
  linksForInstitution,
  normalizeAcademicLinksStore
} from './academic-center-links-store.js';
import { examCalendarLevelForClassLevel } from './exam-calendar.js';
import {
  DEFAULT_NOTIFY_SETTINGS,
  examRoomForLevel,
  examTitle,
  formatTrDate,
  normalizeNotifySettings,
  planNotifyActions,
  renderNotifyTemplate,
  uniqueStudents
} from './deneme-exam-notify-logic.js';

export const NOTIFY_SCHEMA_HINT =
  "Supabase SQL Editor'da sql/2026-11-09-deneme-exam-notify.sql dosyasını çalıştırın.";

export const NOTIFY_GAPS = [
  'Deneme takviminde sınav saati yok. Saat, bu ekrandaki varsayılan saatten gelir. Takvim satırına exam_time yazılırsa o saat kullanılır ve bekleyen gönderimler güncellenir.',
  'Katılım, sınav takvimi satırına değil Akademik Merkez deneme odasına giriş kaydına (academic_deneme_join_logs) bağlıdır. Aynı gün o kademenin odasına giren öğrenci katılmış sayılır.',
  'Sonuç karnesi Edesis PDF’i takvim satırıyla eşleşmiyor. Karne, o tarihte yayımlanmış exam_results kaydından üretilir ve yalnız o öğrenciye özel bağlantıyla açılır.',
  '3. sınıf deneme odasının varsayılan bağlantısı örnek bir adrestir. Lise ve LGS odaları platform Zoom bağlantısını kullanır. Kurum kendi Akademik Merkez bağlantısını kaydettiyse o adres gider.',
  'Mesaj düz metin olarak gider. WhatsApp 24 saat penceresi kapalıysa ve onaylı şablon yoksa satır başarısız görünür; aynı bildirimi kendiliğinden tekrar göndermeyiz.'
];

const PUBLIC_ORIGIN = 'https://www.dersonlinevipkocluk.com';
const MAX_SENDS = 120;

function schemaMiss(error) {
  return (
    isMissingTableError(error, 'deneme_exam_notify') ||
    isMissingTableError(error, 'exam_time') ||
    String(error?.code || '') === '42703'
  );
}

export async function loadNotifySettings(institutionId) {
  const { data, error } = await supabaseAdmin
    .from('deneme_exam_notify_settings')
    .select('*')
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (error) throw error;
  return normalizeNotifySettings({ ...DEFAULT_NOTIFY_SETTINGS, ...(data || {}) });
}

async function loadExistingSends(institutionId, examIds) {
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('deneme_exam_notify_sends')
      .select('exam_id, student_id, step, status, scheduled_for, error, karne_token, phone')
      .eq('institution_id', institutionId)
      .in('exam_id', examIds)
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function loadLinks(institutionId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_academic_center_links')
      .select('links, payload')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    const store = normalizeAcademicLinksStore(data?.links ?? data?.payload);
    return linksForInstitution(store, institutionId);
  } catch {
    return linksForInstitution(null, institutionId);
  }
}

async function loadExams(institutionId, today) {
  const from = addCalendarDaysYmd(today, -21);
  const to = addCalendarDaysYmd(today, 2);
  let q = supabaseAdmin
    .from('exam_calendar')
    .select('id, level, publisher, exam_no, exam_date, content, status, exam_time, institution_id')
    .eq('institution_id', institutionId)
    .gte('exam_date', from)
    .lte('exam_date', to)
    .order('exam_date', { ascending: true })
    .limit(400);
  let { data, error } = await q;
  if (error && String(error.message || '').includes('exam_time')) {
    const retry = await supabaseAdmin
      .from('exam_calendar')
      .select('id, level, publisher, exam_no, exam_date, content, status, institution_id')
      .eq('institution_id', institutionId)
      .gte('exam_date', from)
      .lte('exam_date', to)
      .order('exam_date', { ascending: true })
      .limit(400);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return data || [];
}

export async function resolveNotifyAudience(institutionId, targets) {
  const { data: allStudents, error } = await supabaseAdmin
    .from('students')
    .select('id, name, class_level, phone, parent_phone')
    .eq('institution_id', institutionId)
    .limit(5000);
  if (error) throw error;
  const byId = new Map((allStudents || []).map((s) => [String(s.id), s]));
  const picked = [];

  const classIds = [...new Set((targets || []).filter((t) => t.kind === 'class' && t.class_id).map((t) => t.class_id))];
  const classMembers = new Map();
  if (classIds.length) {
    const { data: links, error: cErr } = await supabaseAdmin
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', classIds);
    if (cErr) throw cErr;
    for (const row of links || []) {
      const list = classMembers.get(row.class_id) || [];
      list.push(String(row.student_id));
      classMembers.set(row.class_id, list);
    }
  }

  for (const target of targets || []) {
    if (target.kind === 'student' && target.student_id && byId.has(String(target.student_id))) {
      picked.push(byId.get(String(target.student_id)));
    } else if (target.kind === 'class') {
      for (const sid of classMembers.get(target.class_id) || []) {
        if (byId.has(sid)) picked.push(byId.get(sid));
      }
    } else if (target.kind === 'grade') {
      for (const student of byId.values()) {
        if (examCalendarLevelForClassLevel(student.class_level) === String(target.grade_level || '')) {
          picked.push(student);
        }
      }
    }
  }

  return uniqueStudents(picked).map((s) => ({
    id: String(s.id),
    name: String(s.name || '').trim() || 'Öğrenci',
    class_level: s.class_level || '',
    phone: normalizePhoneToE164(s.parent_phone || s.phone) || null
  }));
}

async function loadAttendance(exams, studentIds) {
  const dates = [...new Set(exams.map((e) => String(e.exam_date).slice(0, 10)))];
  const out = {};
  if (!dates.length || !studentIds.length) return out;
  const { data, error } = await supabaseAdmin
    .from('academic_deneme_join_logs')
    .select('student_id, room, istanbul_date, kind')
    .eq('kind', 'exam')
    .in('istanbul_date', dates)
    .limit(8000);
  if (error) {
    if (isMissingTableError(error, 'academic_deneme_join_logs')) return out;
    throw error;
  }
  const wanted = new Set(studentIds);
  for (const exam of exams) {
    const room = examRoomForLevel(exam.level);
    const date = String(exam.exam_date).slice(0, 10);
    const ids = [];
    for (const row of data || []) {
      if (String(row.istanbul_date).slice(0, 10) !== date) continue;
      if (!wanted.has(String(row.student_id))) continue;
      const joined = String(row.room || '').toLowerCase();
      if (room && joined && joined !== room) continue;
      ids.push(String(row.student_id));
    }
    out[exam.id] = [...new Set(ids)];
  }
  return out;
}

async function loadResults(studentIds, exams) {
  const out = {};
  if (!studentIds.length || !exams.length) return out;
  const dates = exams.map((e) => String(e.exam_date).slice(0, 10)).sort();
  const { data, error } = await supabaseAdmin
    .from('exam_results')
    .select('id, student_id, exam_name, date, net_score, correct, wrong, blank, raw_score')
    .in('student_id', studentIds)
    .gte('date', dates[0])
    .lte('date', dates[dates.length - 1])
    .limit(8000);
  if (error) {
    if (isMissingTableError(error, 'exam_results')) return out;
    throw error;
  }
  for (const row of data || []) {
    const sid = String(row.student_id);
    if (!out[sid]) out[sid] = [];
    out[sid].push(row);
  }
  return out;
}

async function defaultSend(phone, message) {
  return sendPlainViaMessageService({
    phone,
    message,
    notificationType: 'deneme_exam_notify'
  });
}

export async function processDenemeExamNotify({
  now = new Date(),
  institutionId = null,
  sendMessage = defaultSend,
  log = []
} = {}) {
  const today = getIstanbulDateString(now);
  let settingsQuery = supabaseAdmin.from('deneme_exam_notify_settings').select('*');
  if (institutionId) settingsQuery = settingsQuery.eq('institution_id', institutionId);
  const { data: settingsRows, error: sErr } = await settingsQuery;
  if (sErr) {
    if (schemaMiss(sErr)) return { schema_missing: true, sent: 0, failed: 0 };
    throw sErr;
  }

  const summary = { institutions: 0, sent: 0, failed: 0, queued: 0 };
  for (const rawSettings of settingsRows || []) {
    const iid = String(rawSettings.institution_id);
    const settings = normalizeNotifySettings(rawSettings);
    const exams = await loadExams(iid, today);
    const { data: targets, error: tErr } = await supabaseAdmin
      .from('deneme_exam_notify_targets')
      .select('*')
      .eq('institution_id', iid);
    if (tErr) throw tErr;
    const students = await resolveNotifyAudience(iid, targets || []);
    const stuckBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('deneme_exam_notify_sends')
      .update({ status: 'failed', error: 'sending_timeout', updated_at: now.toISOString() })
      .eq('institution_id', iid)
      .eq('status', 'sending')
      .lt('updated_at', stuckBefore);

    const examIds = exams.map((e) => e.id);
    const existing = examIds.length ? await loadExistingSends(iid, examIds) : [];

    const tokens = new Map();
    for (const row of existing) {
      if (row.step === 'karne' && row.karne_token) tokens.set(`${row.exam_id}|${row.student_id}`, row.karne_token);
    }
    const links = await loadLinks(iid);
    const attendanceByExam = await loadAttendance(exams, students.map((s) => s.id));
    const resultsByStudent = await loadResults(students.map((s) => s.id), exams);
    const plan = planNotifyActions({
      exams,
      students,
      settings,
      existing,
      attendanceByExam,
      resultsByStudent,
      linksByRoom: links?.exams || {},
      nowMs: now.getTime(),
      masterEnabled: settings.enabled,
      karneUrlFor: (examId, studentId) => {
        const k = `${examId}|${studentId}`;
        if (!tokens.has(k)) tokens.set(k, randomBytes(18).toString('base64url'));
        return `${PUBLIC_ORIGIN}/karne/${tokens.get(k)}`;
      }
    });

    const known = new Set(existing.map((row) => `${row.exam_id}|${row.student_id}|${row.step}`));
    const fresh = [];
    for (const row of plan.upserts) {
      const karne_token = row.step === 'karne' ? tokens.get(`${row.exam_id}|${row.student_id}`) || null : null;
      const record = {
        institution_id: iid,
        exam_id: row.exam_id,
        student_id: row.student_id,
        step: row.step,
        status: row.status,
        scheduled_for: row.scheduled_for,
        phone: row.phone,
        error: row.error,
        karne_token,
        updated_at: now.toISOString()
      };
      const k = `${row.exam_id}|${row.student_id}|${row.step}`;
      if (!known.has(k)) fresh.push(record);
      else {
        const { error } = await supabaseAdmin
          .from('deneme_exam_notify_sends')
          .update({
            status: row.status,
            scheduled_for: row.scheduled_for,
            phone: row.phone,
            error: row.error,
            karne_token,
            updated_at: now.toISOString()
          })
          .eq('institution_id', iid)
          .eq('exam_id', row.exam_id)
          .eq('student_id', row.student_id)
          .eq('step', row.step)
          .in('status', ['pending', 'cancelled', 'failed', 'skipped']);
        if (error) throw error;
      }
      summary.queued += 1;
    }
    for (let i = 0; i < fresh.length; i += 200) {
      const slice = fresh.slice(i, i + 200);
      const { error } = await supabaseAdmin.from('deneme_exam_notify_sends').insert(slice);
      if (error && String(error.code) !== '23505') throw error;
      if (error && String(error.code) === '23505') {
        for (const row of slice) {
          const one = await supabaseAdmin.from('deneme_exam_notify_sends').insert(row);
          if (one.error && String(one.error.code) !== '23505') throw one.error;
        }
      }
    }

    let budget = MAX_SENDS;
    for (const job of plan.sends) {
      if (budget <= 0) break;
      if (!settings.enabled) break;
      const { data: claim, error: claimErr } = await supabaseAdmin
        .from('deneme_exam_notify_sends')
        .update({ status: 'sending', message: job.message, updated_at: now.toISOString() })
        .eq('institution_id', iid)
        .eq('exam_id', job.exam_id)
        .eq('student_id', job.student_id)
        .eq('step', job.step)
        .eq('status', 'pending')
        .select('id, karne_token')
        .maybeSingle();
      if (claimErr || !claim) continue;
      budget -= 1;
      let sent;
      if (!job.phone) sent = { ok: false, error: 'telefon_yok' };
      else {
        try {
          sent = await sendMessage(job.phone, job.message);
        } catch (e) {
          sent = { ok: false, error: String(e?.message || e) };
        }
      }
      await supabaseAdmin
        .from('deneme_exam_notify_sends')
        .update({
          status: sent?.ok ? 'sent' : 'failed',
          error: sent?.ok ? null : String(sent?.error || 'send_failed').slice(0, 500),
          sent_at: sent?.ok ? now.toISOString() : null,
          result_id: job.result_id || null,
          updated_at: now.toISOString()
        })
        .eq('id', claim.id);
      if (sent?.ok) summary.sent += 1;
      else summary.failed += 1;
    }
    summary.institutions += 1;
    log.push({ institution_id: iid, exams: exams.length, students: students.length, queued: plan.upserts.length, sends: plan.sends.length });
  }
  return summary;
}

export function sampleNotifyMessage(settings, step) {
  const cfg = normalizeNotifySettings(settings);
  const tpl = step === 'soon' ? cfg.tpl_soon : step === 'karne' ? cfg.tpl_karne : cfg.tpl_day_before;
  return renderNotifyTemplate(tpl, {
    ogrenci: 'Test Öğrenci',
    sinav_adi: '9. Sınıf — 1. deneme · Örnek Yayın',
    tarih: formatTrDate(getIstanbulDateString()),
    saat: cfg.default_exam_time,
    bolum: 'Lise Deneme Sınavı',
    link: 'https://www.dersonlinevipkocluk.com',
    karne_link: `${PUBLIC_ORIGIN}/karne/test-onizleme`
  });
}

export async function sendNotifyTest({ institutionId, step, phone, settings }) {
  const message = sampleNotifyMessage(settings, step);
  const to = normalizePhoneToE164(phone || settings.test_phone);
  if (!to) return { ok: false, error: 'test_phone_missing', message };
  const sent = await defaultSend(to, message);
  await supabaseAdmin.from('deneme_exam_notify_sends').delete().match({
    institution_id: institutionId,
    exam_id: '__test__',
    student_id: '__test__',
    step
  });
  await supabaseAdmin.from('deneme_exam_notify_sends').insert({
    institution_id: institutionId,
    exam_id: '__test__',
    student_id: '__test__',
    step,
    status: sent?.ok ? 'sent' : 'failed',
    phone: to,
    error: sent?.ok ? null : String(sent?.error || 'send_failed').slice(0, 500),
    sent_at: sent?.ok ? new Date().toISOString() : null,
    message
  });
  return { ok: Boolean(sent?.ok), error: sent?.error || null, message, phone: to };
}

export function examLabel(exam) {
  return examTitle(exam);
}
