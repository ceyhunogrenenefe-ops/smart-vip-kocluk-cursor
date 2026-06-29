import { supabaseAdmin } from './supabase-admin.js';
import { getStudentPhones } from './meetings-resolve.js';
import {
  getIstanbulDateString,
  getIstanbulHour,
  getIstanbulMinute,
  getIstanbulWeekdayShort,
  isoWeekdayMon1Istanbul
} from './istanbul-time.js';
import { renderCoachScheduleTemplate } from './coach-whatsapp-schedule-render.js';
import {
  loadInstitutionWhatsappAutomationMap,
  studentAllowsWhatsappAutomation
} from './whatsapp-automation-eligibility.js';
import { resolveGatewayUpstream } from './gateway-upstream.js';
import {
  sendGatewayTextMessage,
  warmActiveCoachGatewaySessions
} from './whatsapp-gateway-send.js';

const KIND = 'coach_gateway_template';

function gatewayReady() {
  return Boolean(
    resolveGatewayUpstream() && String(process.env.APP_JWT_SECRET || '').trim()
  );
}

function istanbulDayDelta(fromIsoDate, toIsoDate) {
  const a = Date.parse(`${fromIsoDate}T12:00:00+03:00`);
  const b = Date.parse(`${toIsoDate}T12:00:00+03:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function campaignStillActive(schedule, todayTr) {
  if (!schedule.campaign_days || !schedule.campaign_started_at) return true;
  const startTr = getIstanbulDateString(new Date(schedule.campaign_started_at));
  const days = istanbulDayDelta(startTr, todayTr);
  return days >= 0 && days < Number(schedule.campaign_days);
}

function timeMatches(schedule, hour, minute) {
  if (hour !== Number(schedule.send_hour_tr)) return false;
  const sm = Number(schedule.send_minute_tr) || 0;
  const delta = minute - sm;
  return delta >= 0 && delta < 15;
}

function studentPrimaryPhoneRow(student, schedule) {
  const channel = String(schedule.recipient_channel || '').trim().toLowerCase();
  const useParent =
    channel === 'parent' ||
    (channel !== 'student' && schedule.prefer_parent_phone === true);
  if (useParent && student.parent_phone?.trim())
    return { ...student, phone: student.parent_phone };
  return student;
}

function repeatModeMatches(schedule, todayTr) {
  const mode = String(schedule.repeat_mode || 'interval').toLowerCase();
  if (mode === 'once') {
    const d = schedule.send_date_tr ? String(schedule.send_date_tr).slice(0, 10) : '';
    return Boolean(d && d === todayTr);
  }
  if (mode === 'daily') return true;
  if (mode === 'weekly') {
    const wd = isoWeekdayMon1Istanbul(todayTr);
    const want = Number(schedule.weekday_tr);
    return wd != null && want >= 1 && want <= 7 && wd === want;
  }
  return true;
}

function studentMatchesTarget(st, schedule) {
  const ids = schedule.target_student_ids;
  if (Array.isArray(ids) && ids.length > 0) {
    if (!ids.includes(String(st.id))) return false;
  }
  if (schedule.target_class_level) {
    const cl = st.class_level ?? st.classLevel;
    if (String(cl ?? '') !== String(schedule.target_class_level)) return false;
  }
  if (schedule.target_group_name) {
    const gn = st.group_name ?? st.groupName;
    if (String(gn || '').trim() !== String(schedule.target_group_name).trim()) return false;
  }
  return true;
}

async function eligibleByRepeat(schedule, studentId, todayTr) {
  const mode = String(schedule.repeat_mode || 'interval').toLowerCase();
  if (mode === 'once' || mode === 'daily' || mode === 'weekly') {
    if (await sentToday(schedule.id, studentId, todayTr)) return false;
    return true;
  }
  return eligibleByInterval(schedule, studentId, todayTr);
}

async function sentToday(scheduleId, studentId, todayTr) {
  const { data } = await supabaseAdmin
    .from('coach_whatsapp_gateway_auto_log')
    .select('id,status')
    .eq('gateway_schedule_id', scheduleId)
    .eq('student_id', studentId)
    .eq('reminder_date_tr', todayTr)
    .eq('kind', KIND)
    .eq('status', 'sent')
    .maybeSingle();
  return Boolean(data);
}

async function lastSentDate(scheduleId, studentId) {
  const { data, error } = await supabaseAdmin
    .from('coach_whatsapp_gateway_auto_log')
    .select('reminder_date_tr')
    .eq('gateway_schedule_id', scheduleId)
    .eq('student_id', studentId)
    .eq('kind', KIND)
    .eq('status', 'sent')
    .order('reminder_date_tr', { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0].reminder_date_tr;
}

async function eligibleByInterval(schedule, studentId, todayTr) {
  const interval = Math.max(1, Number(schedule.interval_days) || 1);
  const last = await lastSentDate(schedule.id, studentId);
  if (!last) return true;
  const delta = istanbulDayDelta(last, todayTr);
  return delta >= interval;
}

async function persistSuccessLog(params) {
  const { scheduleId, studentId, todayTr, recipient, body, sid } = params;
  try {
    await supabaseAdmin.from('coach_whatsapp_gateway_auto_log').insert({
      gateway_schedule_id: scheduleId,
      student_id: studentId,
      reminder_date_tr: todayTr,
      kind: KIND,
      recipient_e164: recipient ?? null,
      body,
      external_sid: sid || null,
      status: 'sent',
      last_error: null,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[coach-whatsapp-gateway-auto-cron] log insert', e?.message || e);
  }
}

export async function runCoachWhatsappGatewayAutoCron(opts = {}) {
  const istanbulHour =
    opts.istanbulHour != null ? opts.istanbulHour : getIstanbulHour();
  const istanbulMinute =
    opts.istanbulMinute != null ? opts.istanbulMinute : getIstanbulMinute();
  const todayTr = opts.todayTr ?? getIstanbulDateString();

  if (!gatewayReady()) {
    return { ok: false, skipped: true, reason: 'missing_gateway_env' };
  }

  const { data: schedules, error: schErr } = await supabaseAdmin
    .from('coach_whatsapp_gateway_schedules')
    .select(
      'id, coach_id, message_template, send_hour_tr, send_minute_tr, weekdays_only, interval_days, campaign_days, campaign_started_at, prefer_parent_phone, gateway_user_id, repeat_mode, send_date_tr, weekday_tr, target_student_ids, target_class_level, target_group_name, recipient_channel, task_default, template_var_date, template_var_time, template_var_link'
    )
    .eq('is_active', true);

  if (schErr) throw schErr;

  const gatewaySessionIds = [
    ...new Set(
      (schedules || [])
        .map((s) => String(s.gateway_user_id || '').trim())
        .filter(Boolean)
    )
  ];
  const warmResults = await warmActiveCoachGatewaySessions(gatewaySessionIds);

  const institutionFlags = await loadInstitutionWhatsappAutomationMap(supabaseAdmin);
  const summary = [];

  for (const schedule of schedules || []) {
    if (!campaignStillActive(schedule, todayTr)) {
      summary.push({
        schedule_id: schedule.id,
        coach_id: schedule.coach_id,
        skipped: 'campaign_ended'
      });
      continue;
    }

    if (!timeMatches(schedule, istanbulHour, istanbulMinute)) {
      summary.push({
        schedule_id: schedule.id,
        coach_id: schedule.coach_id,
        skipped: 'wrong_time'
      });
      continue;
    }

    if (!repeatModeMatches(schedule, todayTr)) {
      summary.push({
        schedule_id: schedule.id,
        coach_id: schedule.coach_id,
        skipped: 'repeat_mode'
      });
      continue;
    }

    if (schedule.weekdays_only) {
      const wd = getIstanbulWeekdayShort();
      if (wd === 'Sat' || wd === 'Sun') {
        summary.push({
          schedule_id: schedule.id,
          coach_id: schedule.coach_id,
          skipped: 'weekend'
        });
        continue;
      }
    }

    const { data: coachRow } = await supabaseAdmin
      .from('coaches')
      .select('name')
      .eq('id', schedule.coach_id)
      .maybeSingle();
    const coachName = coachRow?.name?.trim() || 'Koçunuz';

    const { data: students, error: stErr } = await supabaseAdmin
      .from('students')
      .select('id,name,phone,parent_phone,coach_id,institution_id,whatsapp_automation_enabled,class_level,group_name')
      .eq('coach_id', schedule.coach_id);

    if (stErr) {
      summary.push({ schedule_id: schedule.id, error: stErr.message });
      continue;
    }

    const logDetail = [];
    let sentCount = 0;

    for (const st of students || []) {
      try {
        if (!studentMatchesTarget(st, schedule)) {
          logDetail.push({ student_id: st.id, skipped: 'target_filter' });
          continue;
        }
        if (!studentAllowsWhatsappAutomation(st, institutionFlags)) {
          logDetail.push({ student_id: st.id, skipped: 'whatsapp_automation_disabled' });
          continue;
        }
        if (!(await eligibleByRepeat(schedule, st.id, todayTr))) {
          logDetail.push({ student_id: st.id, skipped: 'already_sent_or_interval' });
          continue;
        }

        const rowUse = studentPrimaryPhoneRow(st, schedule);
        const phones = await getStudentPhones(rowUse);
        if (!phones?.length) {
          logDetail.push({ student_id: st.id, skip: 'no_phone' });
          continue;
        }

        const body = renderCoachScheduleTemplate(schedule.message_template, {
          name: st.name,
          coach: coachName,
          date: todayTr,
          task: String(schedule.task_default || '').trim(),
          template_var_date: schedule.template_var_date,
          template_var_time: schedule.template_var_time,
          template_var_link: schedule.template_var_link
        }).trim();

        const sessionId = String(schedule.gateway_user_id || '').trim();
        if (!sessionId) {
          logDetail.push({ student_id: st.id, skipped: 'no_gateway_user_id' });
          continue;
        }

        const sendResult = await sendGatewayTextMessage({
          phone: phones[0],
          message: body,
          sessionId,
          sessionCandidates: [sessionId],
          allowSharedFallback: false
        });

        if (!sendResult.ok) {
          logDetail.push({
            student_id: st.id,
            ok: false,
            error: sendResult.error || sendResult.errorCode || 'gateway_send_failed'
          });
          continue;
        }

        await persistSuccessLog({
          scheduleId: schedule.id,
          studentId: st.id,
          todayTr,
          recipient: phones[0],
          body,
          sid: sendResult.sid || sendResult.gateway_message_id || null
        });
        sentCount += 1;
        logDetail.push({
          student_id: st.id,
          ok: true,
          sid: sendResult.sid || sendResult.gateway_message_id,
          channel: 'gateway'
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logDetail.push({ student_id: st.id, ok: false, error: msg });
      }
    }

    if (String(schedule.repeat_mode || '').toLowerCase() === 'once') {
      try {
        await supabaseAdmin
          .from('coach_whatsapp_gateway_schedules')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', schedule.id);
      } catch (e) {
        console.warn('[coach-whatsapp-gateway-auto-cron] once deactivate', e?.message || e);
      }
    }

    summary.push({
      schedule_id: schedule.id,
      coach_id: schedule.coach_id,
      processed_students: (students || []).length,
      sent_count: sentCount,
      log: logDetail
    });
  }

  return {
    ok: true,
    today_tr: todayTr,
    istanbul_hour: istanbulHour,
    istanbul_minute: istanbulMinute,
    channel: 'gateway',
    warmed_sessions: warmResults,
    summary
  };
}
