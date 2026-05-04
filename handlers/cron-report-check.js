import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, getIstanbulHour } from '../api/_lib/istanbul-time.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { sendWhatsAppMessage } from '../api/_lib/whatsapp-twilio.js';
import { getStudentPhoneForReport } from '../api/_lib/meetings-resolve.js';

/**
 * Rapor = bugün (İstanbul) `weekly_entries` satırı olan öğrenci (dolduranlar hariç).
 *
 * Zaman sözleşmesi: `api/_lib/vercel-cron-contract.js` → `CRON_DAILY_REPORT_REMINDERS_UTC` (vercel.json ile aynı string).
 * Vercel tetiklemesi UTC’tir; üretimde İstanbul 22:00 için cron **19:00 UTC** olmalıdır.
 *
 * `auth.source === 'vercel'`: yalnızca İstanbul saati 22 iken gönder (yanlış cron saatinden koruma).
 * Bearer ile manuel tetikleme: her saat mümkün (saat filtresi atlanır — geliştirici/test).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const twilioReady =
    Boolean(process.env.TWILIO_ACCOUNT_SID) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN) &&
    Boolean(process.env.TWILIO_WHATSAPP_FROM);

  const log = [];
  const today = getIstanbulDateString();
  const hourIst = getIstanbulHour();

  if (auth.source === 'vercel' && hourIst !== 22) {
    return res.status(200).json({
      ok: true,
      skipped: 'report_reminder_only_istanbul_hour_22',
      istanbul_hour: hourIst,
      log
    });
  }

  if (!twilioReady) {
    return res.status(200).json({ ok: true, skipped: 'missing_twilio_env', log: [] });
  }

  try {
    const { data: template, error: tErr } = await supabaseAdmin
      .from('message_templates')
      .select('content')
      .eq('type', 'report_reminder')
      .maybeSingle();
    if (tErr) throw tErr;
    if (!template?.content) {
      return res.status(200).json({ ok: true, skipped: 'no_report_reminder_template', log });
    }

    const { data: entries, error: eErr } = await supabaseAdmin
      .from('weekly_entries')
      .select('student_id')
      .eq('date', today);
    if (eErr) throw eErr;
    const reportedSet = new Set((entries || []).map((r) => r.student_id));

    const { data: sentRows } = await supabaseAdmin
      .from('message_logs')
      .select('student_id')
      .eq('kind', 'report_reminder')
      .eq('log_date', today)
      .eq('status', 'sent');
    const alreadySent = new Set((sentRows || []).map((r) => r.student_id));

    const { data: students, error: sErr } = await supabaseAdmin
      .from('students')
      .select('id,name,phone,parent_phone,email')
      .limit(8000);
    if (sErr) throw sErr;

    for (const student of students || []) {
      if (reportedSet.has(student.id)) continue;
      if (alreadySent.has(student.id)) continue;

      const dest = await getStudentPhoneForReport(student);
      if (!dest) {
        log.push({ student_id: student.id, note: 'no_student_phone' });
        continue;
      }

      const body = renderMessageTemplate(template.content, {
        student_name: student.name || 'Öğrenci',
        studentName: student.name || 'Öğrenci',
        lesson_name: '',
        time: '',
        link: ''
      });

      try {
        await sendWhatsAppMessage(dest, body);
        const { error: insErr } = await supabaseAdmin.from('message_logs').insert({
          student_id: student.id,
          kind: 'report_reminder',
          related_id: null,
          message: body,
          status: 'sent',
          log_date: today,
          error: null,
          phone: dest
        });
        if (insErr?.code === '23505') log.push({ student_id: student.id, note: 'duplicate_race' });
        else {
          alreadySent.add(student.id);
          log.push({ student_id: student.id, ok: true });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin.from('message_logs').insert({
          student_id: student.id,
          kind: 'report_reminder',
          related_id: null,
          message: body,
          status: 'failed',
          log_date: today,
          error: errMsg,
          phone: dest
        });
        log.push({ student_id: student.id, error: errMsg });
      }
    }

    return res.status(200).json({ ok: true, processed: log.filter((x) => x.ok).length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({
      ok: false,
      error: msg,
      log,
      hint: 'Tablolar: student-coaching-system/sql/2026-05-03-whatsapp-automation-templates-logs.sql'
    });
  }
}
