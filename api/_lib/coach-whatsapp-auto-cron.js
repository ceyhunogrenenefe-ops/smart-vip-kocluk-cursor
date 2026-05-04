import { supabaseAdmin } from './supabase-admin.js';
import { sendMeetingWhatsApp } from './whatsapp-twilio.js';
import { getStudentPhones } from './meetings-resolve.js';
import {
  getIstanbulDateString,
  getIstanbulHour,
  getIstanbulMinute,
  getIstanbulWeekdayShort
} from './istanbul-time.js';
import { renderCoachScheduleTemplate } from './coach-whatsapp-schedule-render.js';

const KIND = 'coach_auto_template';

function twilioReady() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim()
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
  return minute >= sm && minute <= sm + 14;
}

function studentPrimaryPhoneRow(student, preferParent) {
  if (preferParent && student.parent_phone?.trim())
    return { ...student, phone: student.parent_phone };
  return student;
}

async function sentToday(scheduleId, studentId, todayTr) {
  const { data } = await supabaseAdmin
    .from('coach_whatsapp_auto_log')
    .select('id,status')
    .eq('schedule_id', scheduleId)
    .eq('student_id', studentId)
    .eq('reminder_date_tr', todayTr)
    .eq('kind', KIND)
    .eq('status', 'sent')
    .maybeSingle();
  return Boolean(data);
}

async function lastSentDate(scheduleId, studentId) {
  const { data, error } = await supabaseAdmin
    .from('coach_whatsapp_auto_log')
    .select('reminder_date_tr')
    .eq('schedule_id', scheduleId)
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
    await supabaseAdmin.from('coach_whatsapp_auto_log').insert({
      schedule_id: scheduleId,
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
    console.warn('[coach-whatsapp-auto-cron] log insert', e?.message || e);
  }
}

export async function runCoachWhatsappAutoCron(opts = {}) {
  const istanbulHour =
    opts.istanbulHour != null ? opts.istanbulHour : getIstanbulHour();
  const istanbulMinute =
    opts.istanbulMinute != null ? opts.istanbulMinute : getIstanbulMinute();
  const todayTr = opts.todayTr ?? getIstanbulDateString();

  if (!twilioReady()) {
    return { ok: false, skipped: true, reason: 'missing_twilio_env' };
  }

  const { data: schedules, error: schErr } = await supabaseAdmin
    .from('coach_whatsapp_schedules')
    .select(
      'id, coach_id, message_template, send_hour_tr, send_minute_tr, weekdays_only, interval_days, campaign_days, campaign_started_at, prefer_parent_phone'
    )
    .eq('is_active', true);

  if (schErr) throw schErr;

  const summary = [];

  for (const schedule of schedules || []) {
    if (!campaignStillActive(schedule, todayTr)) {
      summary.push({ schedule_id: schedule.id, coach_id: schedule.coach_id, skipped: 'campaign_ended' });
      continue;
    }

    if (!timeMatches(schedule, istanbulHour, istanbulMinute)) {
      summary.push({ schedule_id: schedule.id, coach_id: schedule.coach_id, skipped: 'wrong_time' });
      continue;
    }

    if (schedule.weekdays_only) {
      const wd = getIstanbulWeekdayShort();
      if (wd === 'Sat' || wd === 'Sun') {
        summary.push({ schedule_id: schedule.id, coach_id: schedule.coach_id, skipped: 'weekend' });
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
      .select('id,name,phone,parent_phone,coach_id')
      .eq('coach_id', schedule.coach_id);

    if (stErr) {
      summary.push({ schedule_id: schedule.id, error: stErr.message });
      continue;
    }

    const logDetail = [];

    for (const st of students || []) {
      try {
        if (await sentToday(schedule.id, st.id, todayTr)) {
          logDetail.push({ student_id: st.id, skipped: 'already_sent_today' });
          continue;
        }
        if (!(await eligibleByInterval(schedule, st.id, todayTr))) {
          logDetail.push({ student_id: st.id, skipped: 'interval' });
          continue;
        }

        const rowUse = studentPrimaryPhoneRow(st, schedule.prefer_parent_phone);
        const phones = await getStudentPhones(rowUse);
        if (!phones?.length) {
          logDetail.push({ student_id: st.id, skip: 'no_phone' });
          continue;
        }

        const body = renderCoachScheduleTemplate(schedule.message_template, {
          name: st.name,
          coach: coachName,
          date: todayTr
        }).trim();

        const { sid } = await sendMeetingWhatsApp(phones[0], body);

        await persistSuccessLog({
          scheduleId: schedule.id,
          studentId: st.id,
          todayTr,
          recipient: phones[0],
          body,
          sid
        });
        logDetail.push({ student_id: st.id, ok: true, sid });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logDetail.push({ student_id: st.id, ok: false, error: msg });
      }
    }

    summary.push({
      schedule_id: schedule.id,
      coach_id: schedule.coach_id,
      processed_students: (students || []).length,
      log: logDetail
    });
  }

  return {
    ok: true,
    today_tr: todayTr,
    istanbul_hour: istanbulHour,
    istanbul_minute: istanbulMinute,
    summary
  };
}
