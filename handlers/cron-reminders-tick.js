/**
 * Tek endpoint — tüm ders/görüşme hatırlatmaları (harici cron veya manuel tetik).
 * GET/POST /api/cron/reminders-tick
 * Authorization: Bearer CRON_SECRET
 *
 * Vercel Hobby: 5 dakikada bir cron çalışmaz; harici servis ile bu URL çağrılmalı.
 */import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import cronMeetingReminders from './cron-meeting-reminders.js';
import cronLessonReminder from './cron-lesson-reminder.js';

function mockRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      body = data;
      return this;
    },
    get result() {
      return { statusCode, body };
    }
  };
}

async function runHandler(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return res.result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const started = Date.now();
  const out = { ok: true, auth: auth.source, jobs: {} };

  try {
    const lesson = await runHandler(cronLessonReminder, req);
    out.jobs.lesson_reminders = { status: lesson.statusCode, ...(lesson.body || {}) };
  } catch (e) {
    out.jobs.lesson_reminders = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const meeting = await runHandler(cronMeetingReminders, req);
    out.jobs.meeting_reminders = { status: meeting.statusCode, ...(meeting.body || {}) };
  } catch (e) {
    out.jobs.meeting_reminders = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  out.elapsed_ms = Date.now() - started;
  return res.status(200).json(out);
}
