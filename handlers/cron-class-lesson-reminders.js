import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';

const WINDOW_MS = 10 * 60 * 1000;

function toUtcMs(dateStr, timeStr) {
  const safeTime = String(timeStr || '00:00:00').slice(0, 8);
  return new Date(`${dateStr}T${safeTime}+03:00`).getTime();
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const metaReady = metaWhatsAppConfigured();

  const now = Date.now();
  const log = [];
  try {
    const { data: sessions } = await supabaseAdmin
      .from('class_sessions')
      .select('id,class_id,lesson_date,start_time,subject,meeting_link,reminder_sent,status')
      .eq('status', 'scheduled')
      .eq('reminder_sent', false);
    if (!metaReady) return res.status(200).json({ ok: true, skipped: 'meta_whatsapp_not_ready' });
    for (const s of sessions || []) {
      const startMs = toUtcMs(s.lesson_date, s.start_time);
      const until = startMs - now;
      if (until <= 0 || until > WINDOW_MS) continue;
      const [{ data: cls }, { data: classStudents }] = await Promise.all([
        supabaseAdmin.from('classes').select('name').eq('id', s.class_id).maybeSingle(),
        supabaseAdmin.from('class_students').select('student_id').eq('class_id', s.class_id)
      ]);
      const studentIds = (classStudents || []).map((x) => x.student_id);
      if (!studentIds.length) continue;
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id,name,phone,parent_phone')
        .in('id', studentIds);
      for (const st of students || []) {
        const vars = {
          student_name: st.name || 'Öğrenci',
          class_name: cls?.name || 'Sınıf',
          subject: s.subject || 'Ders',
          lesson_time: String(s.start_time || '').slice(0, 5),
          meeting_link: s.meeting_link || ''
        };
        const phones = [st.phone, st.parent_phone].map((p) => normalizePhoneToE164(p)).filter(Boolean);
        for (const ph of phones) {
          try {
            const sent = await sendAutomatedWhatsApp({
              phone: ph,
              templateType: 'class_lesson_reminder',
              vars
            });
            log.push({
              session_id: s.id,
              student_id: st.id,
              phone: ph,
              ok: sent.ok,
              channel: sent.channel,
              meta_message_id: sent.sid,
              twilio_error_code: sent.errorCode,
              error: sent.ok ? undefined : sent.error
            });
          } catch (e) {
            log.push({ session_id: s.id, student_id: st.id, phone: ph, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
      await supabaseAdmin.from('class_sessions').update({ reminder_sent: true }).eq('id', s.id);
    }
    return res.status(200).json({ ok: true, processed: log.length, log });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e), log });
  }
}
