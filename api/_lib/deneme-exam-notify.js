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
  examRoomForClass,
  examRoomForLevel,
  examTitle,
  formatTrDate,
  normalizeNotifySettings,
  planNotifyActions,
  renderNotifyTemplate,
  suggestClassJoinLink,
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

function studentPhones(row) {
  const list = [row?.parent_phone, row?.phone].map((p) => normalizePhoneToE164(p)).filter(Boolean);
  return [...new Set(list)];
}

async function loadSlotLinks(classIds) {
  const out = new Map();
  if (!classIds.length) return out;
  const { data, error } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('class_id, meeting_link, subject, updated_at')
    .in('class_id', classIds)
    .limit(2000);
  if (error) return out;
  const ranked = [...(data || [])].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  for (const row of ranked) {
    const id = String(row.class_id);
    const link = String(row.meeting_link || '').trim();
    if (!/^https?:\/\//i.test(link)) continue;
    const deneme = /deneme/i.test(String(row.subject || ''));
    const prev = out.get(id);
    if (!prev || (deneme && !prev.deneme)) out.set(id, { link, deneme });
  }
  const flat = new Map();
  for (const [id, row] of out) flat.set(id, row.link);
  return flat;
}

export async function resolveNotifyAudience(institutionId, targets, linksByRoom = {}) {
  const { data: allStudents, error } = await supabaseAdmin
    .from('students')
    .select('id, name, class_level, phone, parent_phone')
    .eq('institution_id', institutionId)
    .limit(5000);
  if (error) throw error;
  const byId = new Map((allStudents || []).map((s) => [String(s.id), s]));
  const picked = [];

  const classTargets = (targets || []).filter((t) => t.kind === 'class' && t.class_id);
  const classIds = [...new Set(classTargets.map((t) => String(t.class_id)))];
  const classMembers = new Map();
  const classMeta = new Map();
  if (classIds.length) {
    const { data: links, error: cErr } = await supabaseAdmin
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', classIds);
    if (cErr) throw cErr;
    for (const row of links || []) {
      const list = classMembers.get(String(row.class_id)) || [];
      list.push(String(row.student_id));
      classMembers.set(String(row.class_id), list);
    }
    const { data: classes } = await supabaseAdmin
      .from('classes')
      .select('id, name, class_level')
      .in('id', classIds);
    for (const row of classes || []) classMeta.set(String(row.id), row);
  }
  const slotLinks = await loadSlotLinks(classIds);
  const explicitByClass = new Map();
  const loose = [];
  for (const target of targets || []) {
    if (target.kind !== 'student' || !target.student_id) continue;
    if (target.source_class_id) {
      const list = explicitByClass.get(String(target.source_class_id)) || [];
      list.push(String(target.student_id));
      explicitByClass.set(String(target.source_class_id), list);
    } else if (byId.has(String(target.student_id))) {
      loose.push(byId.get(String(target.student_id)));
    }
  }

  const orderedClasses = [...classTargets].sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
  for (const target of orderedClasses) {
    const cid = String(target.class_id);
    const meta = classMeta.get(cid);
    const room = examRoomForClass(meta?.class_level, meta?.name);
    const join = suggestClassJoinLink({
      slotLink: String(target.join_link || '').trim() || slotLinks.get(cid),
      room,
      linksByRoom
    });
    const explicit = explicitByClass.get(cid) || [];
    const memberIds = explicit.length ? explicit : classMembers.get(cid) || [];
    const steps = {
      day_before: target.day_before_enabled !== false,
      soon: target.soon_enabled !== false,
      karne: target.karne_enabled !== false
    };
    for (const sid of memberIds) {
      const student = byId.get(sid);
      if (!student) continue;
      const phones = studentPhones(student);
      picked.push({
        id: String(student.id),
        name: String(student.name || '').trim() || 'Öğrenci',
        class_level: student.class_level || '',
        phone: phones[0] || null,
        phones,
        join_link: join || null,
        room,
        steps,
        active: target.enabled !== false
      });
    }
  }

  for (const target of targets || []) {
    if (target.kind !== 'grade') continue;
    for (const student of byId.values()) {
      if (examCalendarLevelForClassLevel(student.class_level) !== String(target.grade_level || '')) continue;
      const phones = studentPhones(student);
      picked.push({
        id: String(student.id),
        name: String(student.name || '').trim() || 'Öğrenci',
        class_level: student.class_level || '',
        phone: phones[0] || null,
        phones,
        active: true
      });
    }
  }

  for (const student of loose) {
    const phones = studentPhones(student);
    picked.push({
      id: String(student.id),
      name: String(student.name || '').trim() || 'Öğrenci',
      class_level: student.class_level || '',
      phone: phones[0] || null,
      phones,
      active: true
    });
  }

  return uniqueStudents(picked);
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
    const links = await loadLinks(iid);
    const students = await resolveNotifyAudience(iid, targets || [], links?.exams || {});
    const stuckBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('deneme_exam_notify_sends')
      .update({ status: 'failed', error: 'sending_timeout', updated_at: now.toISOString() })
      .eq('institution_id', iid)
      .eq('status', 'sending')
      .lt('updated_at', stuckBefore);

    const examIds = exams.map((e) => e.id);
    const existing = examIds.length ? await loadExistingSends(iid, examIds) : [];
    const audience = new Set(students.filter((s) => s.active !== false).map((s) => String(s.id)));
    const dropped = [...new Set(existing.filter((row) => row.status === 'pending' && !audience.has(String(row.student_id))).map((row) => row.student_id))];
    if (dropped.length && examIds.length) {
      await supabaseAdmin
        .from('deneme_exam_notify_sends')
        .update({ status: 'cancelled', error: 'secimden_cikti', updated_at: now.toISOString() })
        .eq('institution_id', iid)
        .eq('status', 'pending')
        .in('exam_id', examIds)
        .in('student_id', dropped);
      for (const row of existing) {
        if (row.status === 'pending' && dropped.includes(row.student_id)) row.status = 'cancelled';
      }
    }

    const tokens = new Map();
    for (const row of existing) {
      if (row.step === 'karne' && row.karne_token) tokens.set(`${row.exam_id}|${row.student_id}`, row.karne_token);
    }
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
      const phones = [...new Set((job.phones?.length ? job.phones : [job.phone]).map((p) => String(p || '').trim()).filter(Boolean))];
      let sent = { ok: false, error: 'telefon_yok' };
      if (phones.length) {
        const errors = [];
        let okAny = false;
        for (const phone of phones) {
          try {
            const one = await sendMessage(phone, job.message);
            if (one?.ok) okAny = true;
            else errors.push(String(one?.error || 'send_failed'));
          } catch (e) {
            errors.push(String(e?.message || e));
          }
        }
        sent = okAny ? { ok: true } : { ok: false, error: errors[0] || 'send_failed' };
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
