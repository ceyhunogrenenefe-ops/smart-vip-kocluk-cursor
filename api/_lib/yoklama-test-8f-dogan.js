/**
 * Canlı test: 8F yoklama + kamera özetini Doğan Aktürk’e WhatsApp ile gönder.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import {
  buildAttendanceSummary,
  formatCoachAttendanceSummaryMessage
} from './attendance-summary.js';
import {
  CAMERA_OFF_KIND,
  CAMERA_OFF_KINDS,
  COACH_SUMMARY_KIND,
  COACH_SUMMARY_KINDS,
  logAttendanceWa,
  sendAttendanceTemplateOrPlain,
  sendCameraOffNoticeForStudent
} from './class-attendance-notify.js';
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import { resolveAutomationSendChannel } from './whatsapp-automation-channel.js';

function istanbulToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizeClassKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function clip(value, max = 80) {
  const t = String(value ?? '');
  if (t.length <= max) return t || '—';
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function numberedStudentNames(entries) {
  if (!entries?.length) return 'Yok';
  return entries.map((e, i) => `${i + 1}. ${e.name}`).join('\n');
}

async function findClass8F(classHint = '8F') {
  const hint = String(classHint || '8F').trim() || '8F';
  const want = normalizeClassKey(hint);
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('id,name,institution_id')
    .order('name', { ascending: true })
    .limit(400);
  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  const exact =
    rows.find((c) => normalizeClassKey(c.name) === want) ||
    rows.find((c) => normalizeClassKey(c.name).includes(want)) ||
    rows.find((c) => String(c.name || '').toUpperCase().includes(hint.toUpperCase()));
  if (!exact) {
    return {
      ok: false,
      error: 'class_not_found',
      hint: `Sınıf bulunamadı: ${hint}`,
      sample: rows.slice(0, 20).map((c) => c.name)
    };
  }
  return { ok: true, classRow: exact };
}

async function findDoganAkturk() {
  const nameMatchers = ['Doğan Aktürk', 'Dogan Akturk', 'Doğan Akturk', 'Dogan Aktürk'];
  const tryTables = [
    { table: 'coaches', cols: 'id,name,phone,email' },
    { table: 'users', cols: 'id,name,phone,email,role' },
    { table: 'teachers', cols: 'id,name,phone,email' }
  ];

  for (const t of tryTables) {
    for (const nm of nameMatchers) {
      try {
        const { data } = await supabaseAdmin
          .from(t.table)
          .select(t.cols)
          .ilike('name', `%${nm.split(' ')[0]}%`)
          .limit(20);
        const hit = (data || []).find((r) => {
          const n = String(r.name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          return n.includes('dogan') && n.includes('akturk');
        });
        if (hit) {
          let phone = normalizePhoneToE164(hit.phone);
          if (!phone && hit.email) {
            const { data: u } = await supabaseAdmin
              .from('users')
              .select('phone')
              .eq('email', hit.email)
              .maybeSingle();
            phone = normalizePhoneToE164(u?.phone);
          }
          return {
            ok: Boolean(phone),
            source: t.table,
            id: hit.id,
            name: hit.name,
            phone: phone || null,
            email: hit.email || null,
            error: phone ? null : 'phone_missing'
          };
        }
      } catch {
        /* tablo yoksa atla */
      }
    }
  }
  return { ok: false, error: 'dogan_not_found' };
}

async function findSessionForClass(classId) {
  const today = istanbulToday();
  const { data: todayRows } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,subject,lesson_date,start_time,end_time,teacher_id,institution_id,status')
    .eq('class_id', classId)
    .eq('lesson_date', today)
    .order('start_time', { ascending: false })
    .limit(10);
  if (todayRows?.length) return { session: todayRows[0], today: true, candidates: todayRows.length };

  const { data: recent } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,subject,lesson_date,start_time,end_time,teacher_id,institution_id,status')
    .eq('class_id', classId)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(5);
  if (recent?.length) return { session: recent[0], today: false, candidates: recent.length };
  return { session: null, today: false, candidates: 0 };
}

async function loadRoster(classId) {
  const { data: links } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .eq('class_id', classId)
    .limit(80);
  const ids = (links || []).map((r) => String(r.student_id || '').trim()).filter(Boolean);
  if (!ids.length) return [];
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id,name,parent_phone,coach_id,phone')
    .in('id', ids);
  return students || [];
}

async function loadExistingAttendance(sessionId) {
  const { data } = await supabaseAdmin
    .from('class_session_attendance')
    .select('student_id,status,camera_status')
    .eq('session_id', sessionId);
  return data || [];
}

async function clearSentLogs(sessionId, kinds) {
  const sid = String(sessionId || '').trim();
  if (!sid || !kinds?.length) return { cleared: 0 };
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .delete()
    .eq('related_id', sid)
    .in('kind', kinds)
    .eq('status', 'sent')
    .select('id');
  if (error) return { cleared: 0, error: error.message };
  return { cleared: (data || []).length };
}

/**
 * @param {{ classHint?: string, forceResend?: boolean, sendParentCamera?: boolean }} opts
 */
export async function runYoklamaTest8FDogan(opts = {}) {
  await loadMetaWhatsAppSecretsFromDb();
  const classHint = String(opts.classHint || '8F').trim() || '8F';
  const forceResend = opts.forceResend !== false;
  const sendParentCamera = opts.sendParentCamera !== false;

  const classRes = await findClass8F(classHint);
  if (!classRes.ok) return { ok: false, step: 'find_class', ...classRes };

  const dogan = await findDoganAkturk();
  if (!dogan.ok) return { ok: false, step: 'find_dogan', dogan };

  const sessRes = await findSessionForClass(classRes.classRow.id);
  if (!sessRes.session) {
    return {
      ok: false,
      step: 'find_session',
      error: 'session_not_found',
      class: classRes.classRow,
      dogan: { name: dogan.name, phone_suffix: dogan.phone?.slice(-4) }
    };
  }
  const session = sessRes.session;
  const roster = await loadRoster(classRes.classRow.id);
  if (!roster.length) {
    return {
      ok: false,
      step: 'roster',
      error: 'empty_roster',
      class: classRes.classRow,
      session_id: session.id
    };
  }

  const existing = await loadExistingAttendance(session.id);
  const byId = new Map(existing.map((r) => [String(r.student_id), r]));

  /** @type {Array<{student_id:string,status:string,camera_status:string,student_name:string}>} */
  const rows = [];
  for (let i = 0; i < roster.length; i += 1) {
    const st = roster[i];
    const prev = byId.get(String(st.id));
    let status = prev ? String(prev.status || 'present') : 'present';
    let camera = prev?.camera_status != null ? String(prev.camera_status) : 'on';
    // Test: en az 1 kamera kapalı olsun
    if (!prev && i === 0) {
      status = 'present';
      camera = 'off';
    } else if (prev && status !== 'absent' && camera !== 'off' && i === 0) {
      camera = 'off';
    }
    if (status === 'absent') camera = 'n_a';
    rows.push({
      student_id: String(st.id),
      status,
      camera_status: camera === 'off' ? 'off' : status === 'absent' ? 'n_a' : 'on',
      student_name: st.name || 'Öğrenci'
    });
  }

  // Yoklamayı kaydet (Kaydet akışı)
  const upsertPayload = rows.map((r) => ({
    session_id: session.id,
    student_id: r.student_id,
    status: r.status,
    camera_status: r.camera_status,
    marked_by: dogan.id,
    marked_at: new Date().toISOString()
  }));
  const { error: upErr } = await supabaseAdmin
    .from('class_session_attendance')
    .upsert(upsertPayload, { onConflict: 'session_id,student_id' });
  if (upErr) {
    const msg = String(upErr.message || '').toLowerCase();
    if (msg.includes('camera_status')) {
      const stripped = upsertPayload.map(({ camera_status: _c, ...rest }) => rest);
      const { error: upErr2 } = await supabaseAdmin
        .from('class_session_attendance')
        .upsert(stripped, { onConflict: 'session_id,student_id' });
      if (upErr2) {
        return { ok: false, step: 'upsert_attendance', error: upErr2.message };
      }
    } else {
      return { ok: false, step: 'upsert_attendance', error: upErr.message };
    }
  }

  if (forceResend) {
    await clearSentLogs(session.id, [...COACH_SUMMARY_KINDS, ...CAMERA_OFF_KINDS]);
  }

  const summary = buildAttendanceSummary(rows);
  const className = classRes.classRow.name || '8F';
  const lessonDateTime = `${session.lesson_date || ''} ${String(session.start_time || '').slice(0, 5)}`.trim();
  const teacherName = 'Doğan Aktürk';
  const text = formatCoachAttendanceSummaryMessage({
    className,
    lessonName: session.subject || 'Ders',
    teacherName,
    coachName: dogan.name || 'Doğan Aktürk',
    lessonDateTime,
    summary
  });

  const vars = {
    class_name: clip(className),
    lesson_name: clip(session.subject || 'Ders'),
    teacher_name: clip(teacherName),
    coach_name: clip(dogan.name || 'Doğan Aktürk'),
    lesson_date_time: clip(lessonDateTime),
    total_students: String(summary.total),
    present_count: String(summary.present),
    late_count: String(summary.late),
    absent_count: String(summary.absent),
    camera_open_count: String(summary.cameraOpen),
    camera_closed_count: String(summary.cameraClosed),
    present_students: clip(numberedStudentNames(summary.presentStudents), 900),
    late_students: clip(numberedStudentNames(summary.lateStudents), 900),
    absent_students: clip(numberedStudentNames(summary.absentStudents), 900),
    camera_open_students: clip(numberedStudentNames(summary.cameraOpenStudents), 900),
    camera_closed_students: clip(numberedStudentNames(summary.cameraClosedStudents), 900)
  };

  const channel = resolveAutomationSendChannel();
  const coachSend = await sendAttendanceTemplateOrPlain({
    phone: dogan.phone,
    templateType: COACH_SUMMARY_KIND,
    vars,
    plainText: text,
    coachId: dogan.source === 'coaches' ? dogan.id : undefined
  });

  await logAttendanceWa({
    studentId: null,
    sessionId: session.id,
    kind: COACH_SUMMARY_KIND,
    message: coachSend.bodyPreview || text,
    ok: Boolean(coachSend.ok),
    error: coachSend.ok ? null : coachSend.error || 'send_failed',
    phone: dogan.phone,
    metaMessageId: coachSend.sid || coachSend.gateway_message_id || null,
    metaTemplateName: coachSend.meta_template_name || null,
    logDate: session.lesson_date || istanbulToday(),
    channel: coachSend.channel || channel
  });

  /** @type {object[]} */
  const cameraResults = [];
  if (sendParentCamera) {
    const cameraOffRows = rows.filter((r) => r.status !== 'absent' && r.camera_status === 'off');
    for (const row of cameraOffRows.slice(0, 3)) {
      const r = await sendCameraOffNoticeForStudent({
        session,
        className,
        studentId: row.student_id,
        institutionId: session.institution_id || classRes.classRow.institution_id,
        studentName: row.student_name
      });
      cameraResults.push({
        student_id: row.student_id,
        student_name: row.student_name,
        ok: Boolean(r.ok),
        skipped: r.skipped || null,
        note: r.note || null
      });
    }
  }

  return {
    ok: Boolean(coachSend.ok),
    deployMarker: 'yoklama-8f-dogan-test-2026-09-10',
    channel,
    class: { id: classRes.classRow.id, name: className },
    session: {
      id: session.id,
      subject: session.subject,
      lesson_date: session.lesson_date,
      start_time: session.start_time,
      is_today: sessRes.today
    },
    dogan: {
      id: dogan.id,
      name: dogan.name,
      source: dogan.source,
      phone_suffix: dogan.phone.slice(-4)
    },
    summary: {
      total: summary.total,
      present: summary.present,
      late: summary.late,
      absent: summary.absent,
      camera_open: summary.cameraOpen,
      camera_closed: summary.cameraClosed,
      camera_closed_names: summary.cameraClosedStudents.map((s) => s.name)
    },
    coach_whatsapp: {
      ok: Boolean(coachSend.ok),
      channel: coachSend.channel || null,
      meta_template_name: coachSend.meta_template_name || null,
      sid: coachSend.sid || coachSend.gateway_message_id || null,
      error: coachSend.ok ? null : coachSend.error || null,
      preview_head: String(coachSend.bodyPreview || text).slice(0, 280)
    },
    camera_whatsapp: cameraResults,
    note: coachSend.ok
      ? 'Doğan Aktürk’e 8F yoklama + kamera özeti gönderildi.'
      : 'Koç özeti gönderilemedi — hata detayına bakın.'
  };
}
