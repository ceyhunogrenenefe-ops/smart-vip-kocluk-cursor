/**
 * Canlı test: sınıf yoklama koç raporunu belirtilen koça gönder (YKS → Tayyibe).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { buildAttendanceSummary } from './attendance-summary.js';
import {
  COACH_SUMMARY_KIND,
  sendCoachLessonAttendanceSummary
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

async function findClassByHint(classHint) {
  const hint = String(classHint || '').trim() || 'YKS';
  const want = normalizeClassKey(hint);
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('id,name,institution_id')
    .order('name', { ascending: true })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  const scored = rows
    .map((c) => {
      const key = normalizeClassKey(c.name);
      let score = 0;
      if (key === want) score = 100;
      else if (key.includes(want)) score = 80;
      else if (String(c.name || '').toUpperCase().includes(hint.toUpperCase())) score = 60;
      // YKS tercih: YILDIZLAR YKS
      if (hint.toUpperCase().includes('YKS') && key.includes('YKS') && key.includes('YILDIZLAR')) {
        score = Math.max(score, 90);
      }
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return {
      ok: false,
      error: 'class_not_found',
      sample: rows.filter((c) => /YKS|YILDIZ/i.test(c.name || '')).slice(0, 15).map((c) => c.name)
    };
  }
  return { ok: true, classRow: scored[0].c };
}

async function findCoachByName(nameHint) {
  const hint = String(nameHint || '').trim();
  if (!hint) return { ok: false, error: 'coach_name_required' };
  const parts = hint
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const { data } = await supabaseAdmin.from('coaches').select('id,name,phone,email').limit(300);
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const hintN = norm(hint);
  const hit =
    (data || []).find((r) => norm(r.name) === hintN) ||
    (data || []).find((r) => parts.every((p) => norm(r.name).includes(norm(p)))) ||
    (data || []).find((r) => norm(r.name).includes(hintN));
  if (!hit) return { ok: false, error: 'coach_not_found', hint };
  let phone = normalizePhoneToE164(hit.phone);
  if (!phone && hit.email) {
    const { data: u } = await supabaseAdmin.from('users').select('phone').eq('email', hit.email).maybeSingle();
    phone = normalizePhoneToE164(u?.phone);
  }
  return {
    ok: Boolean(phone),
    id: hit.id,
    name: hit.name,
    phone: phone || null,
    error: phone ? null : 'phone_missing'
  };
}

async function findTodayOrRecentSession(classId) {
  const today = istanbulToday();
  const { data: todayRows } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,subject,lesson_date,start_time,end_time,teacher_id,institution_id')
    .eq('class_id', classId)
    .eq('lesson_date', today)
    .order('start_time', { ascending: false })
    .limit(15);
  if (todayRows?.length) {
    // Prefer non-ETUT academic lesson if several today
    const academic =
      todayRows.find((s) => !/etut|etüt|deneme/i.test(String(s.subject || ''))) || todayRows[0];
    return { session: academic, today: true, today_count: todayRows.length };
  }
  const { data: recent } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,subject,lesson_date,start_time,end_time,teacher_id,institution_id')
    .eq('class_id', classId)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(5);
  return { session: recent?.[0] || null, today: false, today_count: 0 };
}

async function loadRoster(classId) {
  const { data: links } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .eq('class_id', classId)
    .limit(120);
  const ids = (links || []).map((r) => String(r.student_id || '').trim()).filter(Boolean);
  if (!ids.length) return [];
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id,name,parent_phone,coach_id')
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

/**
 * @param {{ classHint?: string, coachName?: string, forceResend?: boolean }} opts
 */
export async function runCoachReportTest(opts = {}) {
  await loadMetaWhatsAppSecretsFromDb();
  const classHint = String(opts.classHint || 'YKS').trim() || 'YKS';
  const coachName = String(opts.coachName || 'Tayyibe Öğrenenefe').trim() || 'Tayyibe Öğrenenefe';
  const forceResend = opts.forceResend !== false;

  const classRes = await findClassByHint(classHint);
  if (!classRes.ok) return { ok: false, step: 'find_class', ...classRes };

  const coach = await findCoachByName(coachName);
  if (!coach.ok) return { ok: false, step: 'find_coach', coach };

  const sessRes = await findTodayOrRecentSession(classRes.classRow.id);
  if (!sessRes.session) {
    return { ok: false, step: 'find_session', error: 'session_not_found', class: classRes.classRow };
  }
  const session = sessRes.session;
  const roster = await loadRoster(classRes.classRow.id);
  if (!roster.length) {
    return { ok: false, step: 'roster', error: 'empty_roster', class: classRes.classRow, session_id: session.id };
  }

  const existing = await loadExistingAttendance(session.id);
  const byId = new Map(existing.map((r) => [String(r.student_id), r]));
  const rows = roster.map((st, i) => {
    const prev = byId.get(String(st.id));
    let status = prev ? String(prev.status || 'present') : 'present';
    let camera = prev?.camera_status != null ? String(prev.camera_status) : 'on';
    if (!prev && i === 0) camera = 'off';
    if (status === 'absent') camera = 'n_a';
    return {
      student_id: String(st.id),
      status,
      camera_status: camera === 'off' ? 'off' : status === 'absent' ? 'n_a' : 'on',
      student_name: st.name || 'Öğrenci'
    };
  });

  const upsertPayload = rows.map((r) => ({
    session_id: session.id,
    student_id: r.student_id,
    status: r.status,
    camera_status: r.camera_status,
    marked_by: coach.id,
    marked_at: new Date().toISOString()
  }));
  {
    const { error: upErr } = await supabaseAdmin
      .from('class_session_attendance')
      .upsert(upsertPayload, { onConflict: 'session_id,student_id' });
    if (upErr && String(upErr.message || '').toLowerCase().includes('camera_status')) {
      const stripped = upsertPayload.map(({ camera_status: _c, ...rest }) => rest);
      const { error: upErr2 } = await supabaseAdmin
        .from('class_session_attendance')
        .upsert(stripped, { onConflict: 'session_id,student_id' });
      if (upErr2) return { ok: false, step: 'upsert_attendance', error: upErr2.message };
    } else if (upErr) {
      return { ok: false, step: 'upsert_attendance', error: upErr.message };
    }
  }

  const summary = buildAttendanceSummary(rows);
  const className = classRes.classRow.name;
  const sent = await sendCoachLessonAttendanceSummary({
    session,
    className,
    rows,
    studentIds: rows.map((r) => r.student_id),
    institutionId: session.institution_id || classRes.classRow.institution_id,
    forceCoach: { id: coach.id, name: coach.name, phone: coach.phone },
    forceResend
  });

  return {
    ok: Boolean(sent.ok),
    deployMarker: 'coach-report-tayyibe-yks-2026-09-10',
    channel: resolveAutomationSendChannel(),
    class: { id: classRes.classRow.id, name: className },
    session: {
      id: session.id,
      subject: session.subject,
      lesson_date: session.lesson_date,
      start_time: session.start_time,
      is_today: sessRes.today,
      today_session_count: sessRes.today_count
    },
    coach: {
      id: coach.id,
      name: coach.name,
      phone_suffix: String(coach.phone || '').slice(-4)
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
      ok: Boolean(sent.ok),
      skipped: sent.skipped || null,
      channel: sent.channel || null,
      meta_template_name: sent.meta_template_name || null,
      note: sent.note || null,
      warning: sent.warning || null,
      expected_template: COACH_SUMMARY_KIND
    },
    fix_note:
      'Meta şablon parametrelerinde satır sonu (\\n) yasak — öğrenci listeleri tek satıra çevrildi.',
    note: sent.ok
      ? `${coach.name} koçuna YKS/sınıf yoklama raporu gönderildi.`
      : 'Koç raporu gönderilemedi.'
  };
}
