import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { syncClassSessionsScheduledToCompleted } from '../api/_lib/class-sessions-sync.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import { buildAttendanceReport, getVisibleStudentIdSet } from '../api/_lib/attendance-report-query.js';
import { sendMetaTextMessage } from '../api/_lib/meta-whatsapp.js';
import { isUuid } from '../api/_lib/uuid.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .trim();
}

function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin' || r === 'coach';
}

/** Sınıf listesinde kurum geneli: yalnızca yöneticiler (koç / öğretmen sınıfları sınırlı) */
function seesAllInstitutionClasses(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin';
}

function isTeacherRole(role) {
  return normalizeRole(role) === 'teacher';
}

function hhmmss(v, fallback = '09:00:00') {
  const s = String(v || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return fallback;
}

function addMinutesToTime(start, minutes) {
  const [h, m] = String(start || '09:00:00')
    .slice(0, 8)
    .split(':')
    .map((x) => Number(x || 0));
  const total = h * 60 + m + Number(minutes || 0);
  const hh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

function timeOverlap(aStart, aEnd, bStart, bEnd) {
  const A1 = String(aStart || '').slice(0, 8);
  const A2 = String(aEnd || '').slice(0, 8);
  const B1 = String(bStart || '').slice(0, 8);
  const B2 = String(bEnd || '').slice(0, 8);
  return A1 < B2 && A2 > B1;
}

/** yyyy-mm-dd ile gün ekler (UTC gün kökü – saat kayması yok) */
function addDaysIsoDate(dateStr, days) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  const t = Date.UTC(y, m - 1, d) + Number(days) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Pazartesi=1 … Pazar=7 (ISO uyumlu, UTC tarih) */
function dowFromIsoDate(dateStr) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  const jd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jd === 0 ? 7 : jd;
}

async function teacherTimeConflictOnDate({ teacherId, lessonDate, start, end, excludeSessionIds = [] }) {
  const ex = new Set(excludeSessionIds.map(String));
  const { data: sess, error: sErr } = await supabaseAdmin
    .from('class_sessions')
    .select('id,start_time,end_time,status')
    .eq('teacher_id', teacherId)
    .eq('lesson_date', lessonDate)
    .neq('status', 'cancelled');
  if (sErr) throw sErr;
  for (const r of sess || []) {
    if (ex.has(r.id)) continue;
    if (timeOverlap(start, end, r.start_time, r.end_time)) {
      return { ok: false, reason: `Bu öğretmenin ${lessonDate} tarihinde çakışan bir oturumu var.` };
    }
  }
  const dow = dowFromIsoDate(lessonDate);
  if (dow == null) return { ok: true };
  const { data: slots, error: slErr } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('start_time,end_time')
    .eq('teacher_id', teacherId)
    .eq('day_of_week', dow);
  if (slErr) throw slErr;
  if ((slots || []).some((x) => timeOverlap(start, end, x.start_time, x.end_time))) {
    return { ok: false, reason: `Bu öğretmenin aynı gün/saatte haftalık şablon dersi var (${lessonDate}).` };
  }
  return { ok: true };
}

function completedSessionMinutes(row) {
  const start = String(row?.start_time || '').slice(0, 8);
  const end = String(row?.end_time || '').slice(0, 8);
  const toSec = (t) => {
    const p = String(t || '')
      .trim()
      .split(':')
      .map((x) => Number(x || 0));
    if (p.length < 2 || p.some((x) => Number.isNaN(x))) return null;
    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  };
  const a = toSec(start);
  const b = toSec(end);
  if (a != null && b != null && b >= a) return Math.round((b - a) / 60);
  return 60;
}

/** Eski `classes` şemasında eksik kolon (ör. class_level) nedeniyle oluşan PostgREST hataları */
function isMissingClassesOptionalColumnError(error) {
  const m = String(error?.message || '').toLowerCase();
  return (
    m.includes('schema cache') ||
    m.includes('class_level') ||
    (m.includes('column') && m.includes('does not exist')) ||
    (m.includes('could not find') && m.includes('column'))
  );
}

function mapClassesInsertError(error) {
  const code = error?.code ? String(error.code) : '';
  const msg = String(error?.message || '');
  if (
    code === '23505' ||
    /duplicate key|unique constraint|uq_classes_institution_name/i.test(msg)
  ) {
    return {
      status: 409,
      body: {
        error: 'Bu kurumda aynı isimde bir sınıf zaten var. Farklı bir ad kullanın.',
        code: 'duplicate_class_name'
      }
    };
  }
  return { status: 500, body: { error: msg || 'Sınıf oluşturulamadı.', code: code || undefined } };
}

async function getManagedClassIds(actor) {
  const role = normalizeRole(actor.role);

  if (role === 'admin' || role === 'super_admin') {
    return null;
  }

  /** Koç: yalnızca kendi öğrencilerinin kayıtlı olduğu sınıflar */
  if (role === 'coach') {
    const cid = actor.coach_id ? String(actor.coach_id).trim() : '';
    if (!cid) return [];
    const { data: studs, error: se } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', cid);
    if (se) throw se;
    const studentIds = [...new Set((studs || []).map((s) => String(s.id).trim()).filter(Boolean))];
    if (!studentIds.length) return [];
    const { data: cs, error: ce } = await supabaseAdmin
      .from('class_students')
      .select('class_id')
      .in('student_id', studentIds);
    if (ce) throw ce;
    return [...new Set((cs || []).map((r) => r.class_id).filter(Boolean))];
  }

  if (isTeacherRole(actor.role)) {
    const { data } = await supabaseAdmin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', actor.sub);
    return (data || []).map((r) => r.class_id).filter(Boolean);
  }
  if (role === 'student') {
    let sid = actor.student_id ? String(actor.student_id).trim() : '';
    if (!sid && actor.sub) {
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('email, institution_id')
        .eq('id', actor.sub)
        .maybeSingle();
      const resolved = await resolveStudentRowForUser({
        userId: actor.sub,
        email: userRow?.email,
        institutionId: userRow?.institution_id ?? actor.institution_id ?? null
      });
      if (resolved?.id) sid = String(resolved.id).trim();
    }
    if (!sid) return [];
    const { data, error } = await supabaseAdmin
      .from('class_students')
      .select('class_id')
      .eq('student_id', sid);
    if (error) throw error;
    return (data || []).map((r) => r.class_id).filter(Boolean);
  }
  return [];
}

async function getClassDetails(classId) {
  const [{ data: cls }, { data: teachers }, { data: students }] = await Promise.all([
    supabaseAdmin.from('classes').select('*').eq('id', classId).maybeSingle(),
    supabaseAdmin.from('class_teachers').select('teacher_id').eq('class_id', classId),
    supabaseAdmin.from('class_students').select('student_id').eq('class_id', classId)
  ]);
  return {
    class: cls || null,
    teacher_ids: (teachers || []).map((t) => t.teacher_id),
    student_ids: (students || []).map((s) => s.student_id)
  };
}

async function sendAbsentNotice({ session, className, studentId }) {
  const waReady = metaWhatsAppConfigured();
  if (!waReady) return { ok: false, note: 'meta_whatsapp_not_ready' };
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('name, parent_phone')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return { ok: false, note: 'student_not_found' };
  const parentPhone = normalizePhoneToE164(student.parent_phone);
  if (!parentPhone) return { ok: false, note: 'parent_phone_missing' };
  const lessonDate = String(session.lesson_date || '').trim();
  const lessonTime = String(session.start_time || '').slice(0, 5);
  const vars = {
    student_name: student.name || 'Öğrenciniz',
    class_name: className || 'Sınıf',
    subject: session.subject || 'Ders',
    lesson_date: lessonDate,
    lesson_time: lessonTime
  };
  const sent = await sendAutomatedWhatsApp({
    phone: parentPhone,
    templateType: 'class_absent_notice',
    vars
  });
  const logDate = session.lesson_date && /^\d{4}-\d{2}-\d{2}$/.test(session.lesson_date) ? session.lesson_date : new Date().toISOString().slice(0, 10);
  const preview =
    sent.bodyPreview ||
    renderMessageTemplate(
      'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).',
      vars
    );
  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: studentId,
      kind: 'class_absent_notice',
      related_id: session.id,
      message: preview,
      status: sent.ok ? 'sent' : 'failed',
      log_date: logDate,
      error: sent.ok ? null : sent.error || 'send_failed',
      phone: parentPhone,
      twilio_sid: null,
      twilio_error_code: sent.errorCode || null,
      twilio_content_sid: null,
      meta_message_id: sent.sid || null,
      meta_template_name: sent.meta_template_name || null
    });
  } catch {
    /* log tablosu yoksa veya unique — yoklama akışını bozma */
  }
  return sent.ok ? { ok: true } : { ok: false, note: sent.error || 'whatsapp_failed' };
}

async function attendanceAutoWaEnabled(institutionId) {
  const iid = institutionId != null && institutionId !== '' ? String(institutionId).trim() : '';
  if (!iid) return true;
  const { data, error } = await supabaseAdmin
    .from('attendance_institution_prefs')
    .select('auto_whatsapp_absent')
    .eq('institution_id', iid)
    .maybeSingle();
  if (error || !data) return true;
  return data.auto_whatsapp_absent !== false;
}

function normalizeAttendanceStatus(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'present' || v === 'absent' || v === 'late') return v;
  return 'absent';
}

function buildAttendanceNotifyText(preset, custom, vars) {
  const c = String(custom || '').trim();
  if (c) return renderMessageTemplate(c, vars || {});
  const student = vars.student_name || 'Öğrenci';
  const subj = vars.subject || 'Ders';
  const time = vars.lesson_time || '';
  const teacher = vars.teacher_name || 'Öğretmen';
  const date = vars.lesson_date || '';
  if (preset === 'next_time') {
    return `${student} için ${date} tarihli ${subj} dersine (${time}) zamanında katılım rica olunur. Öğretmen: ${teacher}`;
  }
  if (preset === 'missing_record') {
    return `${student} — ${date} ${subj} (${time}) için eksik ders kaydı / devamsızlık oluşmuştur. Öğretmen: ${teacher}`;
  }
  return `${student} bugün (${date}) ${subj} dersine (${time}) katılım sağlamamıştır. Öğretmen: ${teacher}`;
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    actor = await enrichStudentActor(actor);
  } catch {
    /* JWT geçerli; student_id zenginleştirmesi başarısız olsa bile devam */
  }
  const role = normalizeRole(actor.role);
  const institutionId = actor.institution_id || null;

  if (req.method === 'GET') {
    await syncClassSessionsScheduledToCompleted();
    const scope = String(req.query.scope || 'classes');
    if (scope === 'classes') {
      const allowedClassIds = await getManagedClassIds(actor);
      let q = supabaseAdmin.from('classes').select('*').order('created_at', { ascending: false });
      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.length) return res.status(200).json({ data: [] });
        q = q.in('id', allowedClassIds);
      } else if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const classIds = (data || []).map((c) => c.id);
      const [teachersRes, studentsRes] = await Promise.all([
        classIds.length
          ? supabaseAdmin.from('class_teachers').select('class_id, teacher_id').in('class_id', classIds)
          : Promise.resolve({ data: [] }),
        classIds.length
          ? supabaseAdmin.from('class_students').select('class_id, student_id').in('class_id', classIds)
          : Promise.resolve({ data: [] })
      ]);
      const teacherMap = new Map();
      const studentMap = new Map();
      for (const r of teachersRes.data || []) {
        const arr = teacherMap.get(r.class_id) || [];
        arr.push(r.teacher_id);
        teacherMap.set(r.class_id, arr);
      }
      for (const r of studentsRes.data || []) {
        const arr = studentMap.get(r.class_id) || [];
        arr.push(r.student_id);
        studentMap.set(r.class_id, arr);
      }

      return res.status(200).json({
        data: (data || []).map((c) => ({
          ...c,
          teacher_ids: teacherMap.get(c.id) || [],
          student_ids: studentMap.get(c.id) || []
        }))
      });
    }

    if (scope === 'sessions') {
      const classId = String(req.query.class_id || '').trim();
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const allowedClassIds = await getManagedClassIds(actor);
      let q = supabaseAdmin
        .from('class_sessions')
        .select('*')
        .order('lesson_date', { ascending: true })
        .order('start_time', { ascending: true });
      if (classId) q = q.eq('class_id', classId);
      if (from) q = q.gte('lesson_date', from);
      if (to) q = q.lte('lesson_date', to);

      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.length) return res.status(200).json({ data: [] });
        q = q.in('class_id', allowedClassIds);
      } else if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || [] });
    }

    if (scope === 'summary') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const teacherId = String(req.query.teacher_id || '').trim();
      const classId = String(req.query.class_id || '').trim();
      let q = supabaseAdmin
        .from('class_sessions')
        .select('teacher_id,class_id,start_time,end_time,status,lesson_date')
        .eq('status', 'completed');
      if (from) q = q.gte('lesson_date', from);
      if (to) q = q.lte('lesson_date', to);
      if (teacherId) q = q.eq('teacher_id', teacherId);
      if (classId) q = q.eq('class_id', classId);
      if (role === 'admin' && institutionId) q = q.eq('institution_id', institutionId);
      if (role === 'super_admin' && institutionId) {
        const scoped = String(req.query.institution_id || '').trim();
        if (scoped && !isUuid(scoped)) {
          return res.status(400).json({
            error: 'invalid_institution_uuid',
            hint: 'Kurum kimliği UUID olmalı (class_sessions). Üst çubuktan geçerli bir kurum seçin veya yeni kurum oluşturun.'
          });
        }
        if (scoped) q = q.eq('institution_id', scoped);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const agg = new Map();
      for (const row of data || []) {
        const key = `${row.teacher_id}|${row.class_id}`;
        const cur = agg.get(key) || {
          teacher_id: row.teacher_id,
          class_id: row.class_id,
          completed_lesson_count: 0,
          total_minutes: 0
        };
        cur.completed_lesson_count += 1;
        cur.total_minutes += completedSessionMinutes(row);
        agg.set(key, cur);
      }

      const vals = [...agg.values()];
      const teacherIds = [...new Set(vals.map((x) => x.teacher_id).filter(Boolean))];
      const classIds = [...new Set(vals.map((x) => x.class_id).filter(Boolean))];

      const teacherNames = {};
      if (teacherIds.length) {
        const { data: users } = await supabaseAdmin.from('users').select('id,name,email').in('id', teacherIds);
        for (const u of users || []) {
          teacherNames[u.id] = u.name || u.email || u.id;
        }
      }
      const classNames = {};
      if (classIds.length) {
        const { data: classes } = await supabaseAdmin.from('classes').select('id,name').in('id', classIds);
        for (const c of classes || []) {
          classNames[c.id] = c.name || c.id;
        }
      }

      const rows = vals
        .map((r) => ({
          teacher_id: r.teacher_id,
          class_id: r.class_id,
          teacher_name: teacherNames[r.teacher_id] || r.teacher_id,
          class_name: classNames[r.class_id] || r.class_id,
          completed_lesson_count: r.completed_lesson_count,
          total_minutes: r.total_minutes,
          total_hours: Math.round((r.total_minutes / 60) * 100) / 100
        }))
        .sort((a, b) => {
          const x = a.teacher_name.localeCompare(b.teacher_name, 'tr');
          if (x !== 0) return x;
          return a.class_name.localeCompare(b.class_name, 'tr');
        });

      return res.status(200).json({ data: rows });
    }

    if (scope === 'slots') {
      const classId = String(req.query.class_id || '').trim();
      const allowedClassIds = await getManagedClassIds(actor);
      let q = supabaseAdmin
        .from('class_weekly_slots')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (classId) q = q.eq('class_id', classId);
      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.length) return res.status(200).json({ data: [] });
        q = q.in('class_id', allowedClassIds);
      } else if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || [] });
    }

    if (scope === 'attendance') {
      const sessionId = String(req.query.session_id || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('id,class_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const allowedClassIds = await getManagedClassIds(actor);
      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.includes(session.class_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      }
      const { data, error } = await supabaseAdmin
        .from('class_session_attendance')
        .select('*')
        .eq('session_id', sessionId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || [] });
    }

    if (scope === 'attendance-prefs') {
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      let iid = institutionId ? String(institutionId).trim() : '';
      if (role === 'super_admin') {
        const scoped = String(req.query.institution_id || '').trim();
        if (scoped) iid = scoped;
      }
      if (!iid) {
        return res.status(200).json({ data: { auto_whatsapp_absent: true, institution_id: null } });
      }
      if (!isUuid(iid)) {
        return res.status(400).json({
          error: 'invalid_institution_uuid',
          hint: 'Kurum kimliği UUID olmalı. Tarayıcıda eski kurum seçimini temizleyin veya Ayarlar’dan geçerli kurumu seçin.'
        });
      }
      const { data, error } = await supabaseAdmin
        .from('attendance_institution_prefs')
        .select('auto_whatsapp_absent')
        .eq('institution_id', iid)
        .maybeSingle();
      if (error && !String(error.message || '').toLowerCase().includes('relation') && !String(error.message || '').includes('does not exist')) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({
        data: {
          institution_id: iid,
          auto_whatsapp_absent: data ? data.auto_whatsapp_absent !== false : true
        }
      });
    }

    if (scope === 'attendance-report') {
      const rep = await buildAttendanceReport({
        supabaseAdmin,
        getManagedClassIds,
        seesAllInstitutionClasses,
        normalizeRole,
        institutionId,
        actor,
        role,
        query: req.query
      });
      if (rep.error) return res.status(rep.error.status).json(rep.error.body);
      return res.status(200).json(rep);
    }
  }

  if (req.method === 'POST') {
    const op = String(req.query.op || '').trim();
    const body = parseBody(req);

    if (op === 'set-attendance-prefs') {
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      let iid = institutionId ? String(institutionId).trim() : '';
      if (role === 'super_admin') {
        iid = String(body.institution_id || req.query.institution_id || '').trim();
      }
      if (!iid) return res.status(400).json({ error: 'institution_id_required' });
      if (!isUuid(iid)) {
        return res.status(400).json({
          error: 'invalid_institution_uuid',
          hint: 'Kurum kimliği UUID olmalı.'
        });
      }
      const auto = Object.prototype.hasOwnProperty.call(body, 'auto_whatsapp_absent')
        ? Boolean(body.auto_whatsapp_absent)
        : true;
      const { error: pe } = await supabaseAdmin.from('attendance_institution_prefs').upsert(
        {
          institution_id: iid,
          auto_whatsapp_absent: Boolean(auto),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'institution_id' }
      );
      if (pe && !String(pe.message || '').toLowerCase().includes('relation') && !String(pe.message || '').includes('does not exist')) {
        return res.status(500).json({ error: pe.message });
      }
      return res.status(200).json({ ok: true, data: { institution_id: iid, auto_whatsapp_absent: Boolean(auto) } });
    }

    if (op === 'bulk-attendance-notify') {
      const allowed = ['teacher', 'coach', 'admin', 'super_admin'];
      if (!allowed.includes(role)) return res.status(403).json({ error: 'forbidden' });
      const targets = Array.isArray(body.targets) ? body.targets : [];
      if (!targets.length) return res.status(400).json({ error: 'targets_required' });
      const preset = String(body.message_preset || 'absent_standard').trim();
      const custom = String(body.custom_message || '').trim();
      const ctx = body.session_context && typeof body.session_context === 'object' ? body.session_context : {};
      const visible = await getVisibleStudentIdSet(supabaseAdmin, normalizeRole, actor, institutionId);
      const varsBase = {
        student_name: String(ctx.student_name || '{{student_name}}'),
        subject: String(ctx.subject || ''),
        lesson_time: String(ctx.lesson_time || ''),
        teacher_name: String(ctx.teacher_name || ''),
        lesson_date: String(ctx.lesson_date || ''),
        class_name: String(ctx.class_name || '')
      };
      const results = [];
      for (const t of targets) {
        const sid = String(t.student_id || '').trim();
        if (!sid) continue;
        if (visible && !visible.has(sid)) {
          results.push({ student_id: sid, ok: false, error: 'forbidden_student' });
          continue;
        }
        const { data: stu } = await supabaseAdmin
          .from('students')
          .select('id,name,phone,parent_phone')
          .eq('id', sid)
          .maybeSingle();
        if (!stu) {
          results.push({ student_id: sid, ok: false, error: 'student_not_found' });
          continue;
        }
        const channels = String(t.channels || 'parent').trim().toLowerCase();
        const vars = {
          ...varsBase,
          student_name: stu.name || varsBase.student_name
        };
        const text = buildAttendanceNotifyText(preset, custom, vars);
        const sendOne = async (phoneRaw) => {
          const e164 = normalizePhoneToE164(phoneRaw);
          if (!e164) return { ok: false, error: 'invalid_phone' };
          try {
            await sendMetaTextMessage({ toE164: e164, text });
            return { ok: true };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : 'send_failed' };
          }
        };
        const rowResult = { student_id: sid, channels: [], parts: [] };
        if (channels === 'student' || channels === 'both') {
          const r = await sendOne(stu.phone);
          rowResult.parts.push({ to: 'student', ...r });
        }
        if (channels === 'parent' || channels === 'both') {
          const r = await sendOne(stu.parent_phone);
          rowResult.parts.push({ to: 'parent', ...r });
        }
        if (channels !== 'student' && channels !== 'parent' && channels !== 'both') {
          const r = await sendOne(stu.parent_phone);
          rowResult.parts.push({ to: 'parent', ...r });
        }
        rowResult.ok = rowResult.parts.some((p) => p.ok);
        results.push(rowResult);
      }
      return res.status(200).json({ ok: true, results });
    }

    if (op === 'create-class') {
      if (!isAdminRole(role)) return res.status(403).json({ error: 'forbidden' });
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name_required' });
      const teacherIds = Array.isArray(body.teacher_ids) ? body.teacher_ids.map(String).filter(Boolean) : [];
      const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String).filter(Boolean) : [];
      const classLevelRaw = String(body.class_level || '').trim() || null;
      const branchRaw = String(body.branch || '').trim() || null;

      const baseRow = {
        institution_id: institutionId,
        name,
        description: String(body.description || '').trim() || null,
        created_by: actor.sub
      };

      let insertRow = { ...baseRow, class_level: classLevelRaw, branch: branchRaw };
      let usedMinimalClassesInsert = false;
      let { data: created, error: insErr } = await supabaseAdmin
        .from('classes')
        .insert(insertRow)
        .select('*')
        .maybeSingle();

      if (insErr && isMissingClassesOptionalColumnError(insErr)) {
        usedMinimalClassesInsert = true;
        ({ data: created, error: insErr } = await supabaseAdmin
          .from('classes')
          .insert(baseRow)
          .select('*')
          .maybeSingle());
      }

      if (insErr) {
        const mapped = mapClassesInsertError(insErr);
        console.warn('[class-live-lessons create-class]', insErr.code, insErr.message);
        return res.status(mapped.status).json(mapped.body);
      }
      if (!created?.id) {
        return res.status(500).json({ error: 'Sınıf kaydı oluşturulamadı (yanıt boş).' });
      }

      if (teacherIds.length) {
        const { error: tErr } = await supabaseAdmin
          .from('class_teachers')
          .insert(teacherIds.map((teacherId) => ({ class_id: created.id, teacher_id: teacherId })));
        if (tErr) {
          await supabaseAdmin.from('classes').delete().eq('id', created.id);
          console.warn('[class-live-lessons create-class] class_teachers', tErr);
          return res.status(400).json({
            error: `Öğretmen atanamadı (geçerli kullanıcı id gerekli): ${tErr.message}`,
            code: String(tErr.code || '')
          });
        }
      }
      if (studentIds.length) {
        const { error: sErr } = await supabaseAdmin
          .from('class_students')
          .insert(studentIds.map((studentId) => ({ class_id: created.id, student_id: studentId })));
        if (sErr) {
          await supabaseAdmin.from('class_teachers').delete().eq('class_id', created.id);
          await supabaseAdmin.from('classes').delete().eq('id', created.id);
          console.warn('[class-live-lessons create-class] class_students', sErr);
          return res.status(400).json({
            error: `Öğrenci atanamadı (geçerli öğrenci kaydı gerekli): ${sErr.message}`,
            code: String(sErr.code || '')
          });
        }
      }

      let responseRow = created;
      if (usedMinimalClassesInsert && (classLevelRaw || branchRaw)) {
        const patch = {};
        if (classLevelRaw) patch.class_level = classLevelRaw;
        if (branchRaw) patch.branch = branchRaw;
        const { data: patched, error: pErr } = await supabaseAdmin
          .from('classes')
          .update(patch)
          .eq('id', created.id)
          .select('*')
          .maybeSingle();
        if (!pErr && patched) responseRow = patched;
      }

      return res.status(201).json({ data: responseRow });
    }

    if (op === 'update-class-members') {
      if (!isAdminRole(role)) return res.status(403).json({ error: 'forbidden' });
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const teacherIds = Array.isArray(body.teacher_ids) ? body.teacher_ids.map(String).filter(Boolean) : [];
      const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String).filter(Boolean) : [];

      await Promise.all([
        supabaseAdmin.from('class_teachers').delete().eq('class_id', classId),
        supabaseAdmin.from('class_students').delete().eq('class_id', classId)
      ]);
      if (teacherIds.length) {
        await supabaseAdmin
          .from('class_teachers')
          .insert(teacherIds.map((teacherId) => ({ class_id: classId, teacher_id: teacherId })));
      }
      if (studentIds.length) {
        await supabaseAdmin
          .from('class_students')
          .insert(studentIds.map((studentId) => ({ class_id: classId, student_id: studentId })));
      }
      if (Object.prototype.hasOwnProperty.call(body, 'class_level') || Object.prototype.hasOwnProperty.call(body, 'branch')) {
        const clsPatch = {};
        if (Object.prototype.hasOwnProperty.call(body, 'class_level'))
          clsPatch.class_level = String(body.class_level || '').trim() || null;
        if (Object.prototype.hasOwnProperty.call(body, 'branch'))
          clsPatch.branch = String(body.branch || '').trim() || null;
        await supabaseAdmin.from('classes').update(clsPatch).eq('id', classId);
      }
      return res.status(200).json({ ok: true });
    }

    if (op === 'create-session') {
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!isAdminRole(role) && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherIdRaw = String(body.teacher_id || '').trim();
      const teacherId = isAdminRole(role) ? teacherIdRaw || details.teacher_ids[0] || actor.sub : actor.sub;
      if (!teacherId) return res.status(400).json({ error: 'teacher_required' });
      const date = String(body.lesson_date || '').trim();
      const start = hhmmss(body.start_time, '09:00:00');
      const duration = Math.max(15, Number(body.duration_minutes || 40));
      const end = hhmmss(body.end_time, addMinutesToTime(start, duration));
      const subject = String(body.subject || '').trim();
      const meetingLink = String(body.meeting_link || '').trim();
      if (!date || !subject || !meetingLink) {
        return res.status(400).json({ error: 'lesson_date_subject_meeting_link_required' });
      }
      const { data, error } = await supabaseAdmin
        .from('class_sessions')
        .insert({
          class_id: classId,
          institution_id: details.class.institution_id || institutionId,
          lesson_date: date,
          start_time: start,
          end_time: end,
          subject,
          teacher_id: teacherId,
          meeting_link: meetingLink,
          homework: String(body.homework || '').trim() || null,
          status: 'scheduled'
        })
        .select('*')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ data });
    }

    if (op === 'mark-attendance') {
      const sessionId = String(body.session_id || '').trim();
      const rows = Array.isArray(body.attendance) ? body.attendance : [];
      if (!sessionId || !rows.length) return res.status(400).json({ error: 'session_id_and_attendance_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { data: priorRows } = await supabaseAdmin
        .from('class_session_attendance')
        .select('student_id,status')
        .eq('session_id', sessionId);
      const priorStatusByStudent = new Map((priorRows || []).map((r) => [String(r.student_id), String(r.status || '')]));

      const prepared = rows
        .map((r) => ({
          session_id: sessionId,
          student_id: String(r.student_id || '').trim(),
          status: normalizeAttendanceStatus(r.status),
          marked_by: actor.sub,
          marked_at: new Date().toISOString()
        }))
        .filter((r) => r.student_id);

      const { error } = await supabaseAdmin
        .from('class_session_attendance')
        .upsert(prepared, { onConflict: 'session_id,student_id' });
      if (error) return res.status(500).json({ error: error.message });

      const className = details.class?.name || 'Sınıf';
      const instKey = session.institution_id != null ? String(session.institution_id).trim() : '';
      const allowAutoWa = await attendanceAutoWaEnabled(instKey);
      for (const row of prepared) {
        if (row.status !== 'absent') continue;
        if (priorStatusByStudent.get(row.student_id) === 'absent') continue;
        if (!allowAutoWa) continue;
        try {
          await sendAbsentNotice({ session, className, studentId: row.student_id });
        } catch {
          // best effort
        }
      }
      return res.status(200).json({ ok: true, suggest_notify: prepared.some((r) => r.status === 'absent') });
    }

    if (op === 'set-homework') {
      const sessionId = String(body.session_id || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('class_sessions')
        .update({
          homework: String(body.homework || '').trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select('*')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data });
    }

    if (op === 'create-slot') {
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!isAdminRole(role) && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherIdRaw = String(body.teacher_id || '').trim();
      const teacherId = isAdminRole(role) ? teacherIdRaw || details.teacher_ids[0] || actor.sub : actor.sub;
      const dayOfWeek = Number(body.day_of_week);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
        return res.status(400).json({ error: 'day_of_week_invalid' });
      }
      const start = hhmmss(body.start_time, '10:00:00');
      const end = hhmmss(body.end_time, addMinutesToTime(start, Math.max(15, Number(body.duration_minutes || 40))));
      const subject = String(body.subject || '').trim();
      const meetingLink = String(body.meeting_link || '').trim();
      if (!subject || !meetingLink) return res.status(400).json({ error: 'subject_meeting_link_required' });

      const { data: sameTeacherSlots, error: cErr } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('id,start_time,end_time')
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dayOfWeek);
      if (cErr) return res.status(500).json({ error: cErr.message });
      if ((sameTeacherSlots || []).some((x) => timeOverlap(start, end, x.start_time, x.end_time))) {
        return res.status(409).json({ error: 'Aynı öğretmen aynı saatte ders alamaz.', code: 'teacher_time_conflict' });
      }

      const { data, error } = await supabaseAdmin
        .from('class_weekly_slots')
        .insert({
          class_id: classId,
          institution_id: details.class.institution_id || institutionId,
          day_of_week: dayOfWeek,
          start_time: start,
          end_time: end,
          subject,
          teacher_id: teacherId,
          meeting_link: meetingLink,
          homework: String(body.homework || '').trim() || null
        })
        .select('*')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ data });
    }

    /**
     * Tarihli oturumları toplu oluşturur: tekrarlanmıyorsa yalnızca başlangıç günü,
     * repeat_interval_days 7 = haftalık, 15 = 15 günlük vb.
     */
    if (op === 'bulk-schedule-sessions') {
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!isAdminRole(role) && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherIdRaw = String(body.teacher_id || '').trim();
      const teacherId = isAdminRole(role) ? teacherIdRaw || details.teacher_ids[0] || actor.sub : actor.sub;
      if (!teacherId) return res.status(400).json({ error: 'teacher_required' });

      const startDate = String(body.lesson_date || body.lesson_date_start || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ error: 'lesson_date_invalid' });
      }
      const rawInterval = Number(body.repeat_interval_days);
      const repeatInterval = Number.isFinite(rawInterval) && rawInterval >= 0 ? Math.floor(rawInterval) : 0;
      const ALLOWED = [0, 7, 15];
      if (!ALLOWED.includes(repeatInterval)) {
        return res.status(400).json({ error: 'repeat_interval_days_invalid', allowed: ALLOWED });
      }
      let occurrences = Math.floor(Number(body.occurrences ?? (repeatInterval === 0 ? 1 : 8)));
      if (repeatInterval === 0) occurrences = 1;
      if (!Number.isFinite(occurrences) || occurrences < 1) occurrences = 1;
      occurrences = Math.min(occurrences, 52);

      const start = hhmmss(body.start_time, '10:00:00');
      const duration = Math.max(15, Number(body.duration_minutes || 40));
      const end = hhmmss(body.end_time, addMinutesToTime(start, duration));
      const subject = String(body.subject || '').trim();
      const meetingLink = String(body.meeting_link || '').trim();
      if (!subject || !meetingLink) return res.status(400).json({ error: 'subject_meeting_link_required' });

      const rowsToInsert = [];
      for (let i = 0; i < occurrences; i++) {
        const lessonDate =
          repeatInterval === 0 ? startDate : addDaysIsoDate(startDate, i * repeatInterval);
        if (!lessonDate) {
          return res.status(400).json({ error: 'date_compute_failed' });
        }
        const clash = await teacherTimeConflictOnDate({ teacherId, lessonDate, start, end });
        if (!clash.ok) {
          return res.status(409).json({
            error: clash.reason || 'Çakışma',
            code: 'teacher_time_conflict',
            lesson_date: lessonDate
          });
        }
        rowsToInsert.push({
          class_id: classId,
          institution_id: details.class.institution_id || institutionId,
          lesson_date: lessonDate,
          start_time: start,
          end_time: end,
          subject,
          teacher_id: teacherId,
          meeting_link: meetingLink,
          homework: String(body.homework || '').trim() || null,
          status: 'scheduled'
        });
      }

      const { data: created, error: insErr } = await supabaseAdmin
        .from('class_sessions')
        .insert(rowsToInsert)
        .select('*');
      if (insErr) return res.status(500).json({ error: insErr.message });
      return res.status(201).json({ data: created || [] });
    }
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const slotMode = String(body.kind || '') === 'slot';
    const rowId = String(body.id || '').trim();
    if (!rowId) return res.status(400).json({ error: 'id_required' });
    const table = slotMode ? 'class_weekly_slots' : 'class_sessions';
    const notFound = slotMode ? 'slot_not_found' : 'session_not_found';
    const { data: session } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', rowId)
      .maybeSingle();
    if (!session) return res.status(404).json({ error: notFound });
    const details = await getClassDetails(session.class_id);
    if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const patch = { updated_at: new Date().toISOString() };
    if (!slotMode && body.lesson_date) patch.lesson_date = String(body.lesson_date).slice(0, 10);
    if (slotMode && body.day_of_week != null) patch.day_of_week = Number(body.day_of_week);
    if (body.start_time) patch.start_time = hhmmss(body.start_time);
    if (body.end_time) patch.end_time = hhmmss(body.end_time);
    if (body.subject) patch.subject = String(body.subject).trim();
    if (body.meeting_link) patch.meeting_link = String(body.meeting_link).trim();
    if (body.status && ['scheduled', 'completed', 'cancelled'].includes(String(body.status))) {
      patch.status = String(body.status);
    }
    if (body.homework !== undefined) patch.homework = String(body.homework || '').trim() || null;

    if (body.teacher_id !== undefined) {
      const tid = String(body.teacher_id || '').trim();
      if (!tid) {
        return res.status(400).json({ error: 'teacher_id_required', code: 'teacher_id_invalid' });
      }
      if (!details.teacher_ids.includes(tid)) {
        return res.status(400).json({
          error:
            'Bu öğretmen sınıfın atanmış öğretmenleri arasında değil. Önce sınıf ayarlarından öğretmeni ekleyin.',
          code: 'teacher_not_in_class'
        });
      }
      patch.teacher_id = tid;
    }

    if (!slotMode && (patch.lesson_date || patch.start_time || patch.end_time || patch.teacher_id)) {
      const teacherIdForCheck = String((patch.teacher_id ?? session.teacher_id) || '');
      const lessonDate = String((patch.lesson_date ?? session.lesson_date) || '').slice(0, 10);
      const start = hhmmss(patch.start_time || session.start_time, '09:00:00');
      const end = hhmmss(patch.end_time || session.end_time, '10:00:00');
      const clash = await teacherTimeConflictOnDate({
        teacherId: teacherIdForCheck,
        lessonDate,
        start,
        end,
        excludeSessionIds: [rowId]
      });
      if (!clash.ok) {
        return res.status(409).json({
          error: clash.reason || 'Çakışma',
          code: 'teacher_time_conflict'
        });
      }
    }

    if (slotMode && (patch.start_time || patch.end_time || patch.day_of_week || patch.teacher_id)) {
      const teacherId = String((patch.teacher_id || session.teacher_id) || '');
      const dayOfWeek = Number(patch.day_of_week || session.day_of_week);
      const start = String((patch.start_time || session.start_time) || '');
      const end = String((patch.end_time || session.end_time) || '');
      const { data: sameTeacherSlots, error: cErr } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('id,start_time,end_time')
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dayOfWeek)
        .neq('id', rowId);
      if (cErr) return res.status(500).json({ error: cErr.message });
      if ((sameTeacherSlots || []).some((x) => timeOverlap(start, end, x.start_time, x.end_time))) {
        return res.status(409).json({ error: 'Aynı öğretmen aynı saatte ders alamaz.', code: 'teacher_time_conflict' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .update(patch)
      .eq('id', rowId)
      .select('*')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const classId = String(req.query.class_id || '').trim();
    const sessionId = String(req.query.session_id || '').trim();
    const slotId = String(req.query.slot_id || '').trim();
    if (sessionId) {
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error } = await supabaseAdmin.from('class_sessions').delete().eq('id', sessionId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (classId) {
      if (!isAdminRole(role)) return res.status(403).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin.from('classes').delete().eq('id', classId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (slotId) {
      const { data: slot } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('*')
        .eq('id', slotId)
        .maybeSingle();
      if (!slot) return res.status(404).json({ error: 'slot_not_found' });
      const details = await getClassDetails(slot.class_id);
      if (!isAdminRole(role) && slot.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error } = await supabaseAdmin.from('class_weekly_slots').delete().eq('id', slotId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'class_id_or_session_id_or_slot_id_required' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
