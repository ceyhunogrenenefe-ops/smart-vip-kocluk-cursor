import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getStudentPhones } from '../api/_lib/meetings-resolve.js';
import { deliverWhatsAppWithLog } from '../api/_lib/meeting-notify.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';

const MAX_REMINDER_ATTEMPTS = 5;

function studentIsim(student) {
  return String(student?.name || '').trim() || 'Öğrenci';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  const log = [];
  const q = req.query || {};
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const force =
    String(q.force || body.force || '').trim() === '1' ||
    String(q.force || body.force || '').trim().toLowerCase() === 'true';
  const diag =
    String(q.diag || body.diag || '').trim() === '1' ||
    String(q.diag || body.diag || '').trim().toLowerCase() === 'true';

  if (diag) {
    try {
      const { fetchTemplatesForWaba, resolveWabaIds } = await import('../api/_lib/meta-templates-sync.js');
      const tok = process.env.META_WHATSAPP_TOKEN?.trim();
      const phoneId = process.env.META_PHONE_NUMBER_ID?.trim();
      const envWaba = process.env.META_WABA_ID?.trim() || null;
      const graph = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
      const auth = { Authorization: `Bearer ${tok}` };

      async function gget(path) {
        const r = await fetch(`https://graph.facebook.com/${graph}/${path}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        return { http: r.status, j };
      }

      let phone_api = null;
      if (tok && phoneId) {
        const a = await gget(
          `${encodeURIComponent(phoneId)}?fields=${encodeURIComponent('id,display_phone_number,verified_name,quality_rating,name_status')}`
        );
        const b = await gget(
          `${encodeURIComponent(phoneId)}?fields=${encodeURIComponent('whatsapp_business_account')}`
        );
        phone_api = {
          basic: {
            http: a.http,
            id: a.j.id || null,
            display: a.j.display_phone_number || null,
            verified: a.j.verified_name || null,
            error: a.j.error?.message || null
          },
          waba_field: {
            http: b.http,
            waba: b.j.whatsapp_business_account?.id || b.j.whatsapp_business_account || null,
            error: b.j.error?.message || null
          }
        };
      }

      const discovered = tok ? await resolveWabaIds() : [];
      const biz = tok ? await gget('me/businesses?fields=id,name&limit=25') : { http: 0, j: {} };
      const owned = [];
      for (const b of biz.j?.data || []) {
        const w = await gget(
          `${encodeURIComponent(b.id)}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id&limit=50`
        );
        for (const row of w.j?.data || []) {
          owned.push({ business: b.name, business_id: b.id, waba_id: row.id, waba_name: row.name });
        }
        const c = await gget(
          `${encodeURIComponent(b.id)}/client_whatsapp_business_accounts?fields=id,name&limit=50`
        );
        for (const row of c.j?.data || []) {
          owned.push({
            business: b.name,
            business_id: b.id,
            waba_id: row.id,
            waba_name: row.name,
            client: true
          });
        }
      }

      const wabaIds = [
        ...new Set(
          [envWaba, phone_api?.waba_field?.waba, ...discovered, ...owned.map((o) => o.waba_id)].filter(Boolean)
        )
      ];

      const per_waba = [];
      for (const w of wabaIds) {
        const full = await fetchTemplatesForWaba(w, tok);
        const all = full.ok ? full.templates || [] : [];
        per_waba.push({
          waba: w,
          ok: full.ok,
          error: full.ok ? null : full.error,
          template_count: all.length,
          sample: all.slice(0, 20).map((t) => `${t.name}|${t.language}|${t.status}`),
          has_toplanti: all.some((t) =>
            /toplant_?hat[iı]?rlatma/i.test(String(t.name || ''))
          ),
          has_absent: all.some((t) => /absent|devamsiz/i.test(String(t.name || ''))),
          absent: all
            .filter((t) => /absent|devamsiz/i.test(String(t.name || '')))
            .map((t) => ({ name: t.name, language: t.language, status: t.status })),
          toplanti: all
            .filter((t) => /toplant_?hat[iı]?rlatma/i.test(String(t.name || '')))
            .map((t) => ({ name: t.name, language: t.language, status: t.status }))
        });
      }

      return res.status(200).json({
        ok: true,
        diag: {
          phone_number_id_set: Boolean(phoneId),
          phone_api,
          env_waba: envWaba,
          businesses: (biz.j?.data || []).map((b) => ({ id: b.id, name: b.name })),
          businesses_error: biz.j?.error?.message || null,
          owned_or_client_wabas: owned,
          per_waba
        }
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  try {
    if (!metaWhatsAppConfigured()) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'meta_whatsapp_not_configured',
        processed: 0,
        log: []
      });
    }

    const nowMs = Date.now();

    const { data: upcoming, error: upErr } = await supabaseAdmin
      .from('meetings')
      .select('*')
      .eq('status', 'planned')
      .eq('whatsapp_reminder_sent', false)
      .gte('start_time', new Date(nowMs - (force ? 2 * 60 * 60_000 : 2 * 60_000)).toISOString())
      .lte('start_time', new Date(nowMs + 48 * 60 * 60_000).toISOString());
    if (upErr) throw upErr;

    for (const m of upcoming || []) {
      const startMs = new Date(m.start_time).getTime();
      const untilStart = startMs - nowMs;
      // 3–25 dk normal; force=1 ile son 2 saat / gelecek 48 saat kaçırılanları dener
      const inReminderWindow = force
        ? untilStart >= -2 * 60 * 60_000 && untilStart <= 48 * 60 * 60_000
        : untilStart >= 3 * 60_000 && untilStart <= 25 * 60_000;
      if (!inReminderWindow) continue;

      const { data: student } = await supabaseAdmin.from('students').select('*').eq('id', m.student_id).maybeSingle();
      if (!student) continue;
      const phones = await getStudentPhones(student);
      if (!phones.length) {
        log.push({ id: m.id, note: 'no_phone' });
        continue;
      }

      const { data: notifRow } = await supabaseAdmin
        .from('meeting_notification_log')
        .select('id,attempt_count,status')
        .eq('meeting_id', m.id)
        .eq('channel', 'whatsapp')
        .eq('kind', 'whatsapp_reminder_10m')
        .maybeSingle();

      const attempts = notifRow?.attempt_count ?? 0;
      if (
        !force &&
        (notifRow?.status === 'failed' || notifRow?.status === 'pending') &&
        attempts >= MAX_REMINDER_ATTEMPTS
      ) {
        log.push({ id: m.id, note: 'max_attempts' });
        continue;
      }

      if (force && notifRow?.status === 'failed') {
        await supabaseAdmin
          .from('meeting_notification_log')
          .update({ status: 'pending', last_error: null })
          .eq('id', notifRow.id);
      }

      const isim = studentIsim(student);
      try {
        const r = await deliverWhatsAppWithLog({
          meetingId: m.id,
          kind: 'whatsapp_reminder_10m',
          recipientE164: phones[0],
          isim,
          coachId: m.coach_id || student.coach_id || null
        });
        if (r.ok && !r.skipped) {
          await supabaseAdmin
            .from('meetings')
            .update({ whatsapp_reminder_sent: true, updated_at: new Date().toISOString() })
            .eq('id', m.id);
        }
        log.push({ id: m.id, isim, force, whatsapp: r });
      } catch (e) {
        log.push({ id: m.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    /** Retry failed logs (recent) */
    const { data: failed } = await supabaseAdmin
      .from('meeting_notification_log')
      .select('*')
      .eq('kind', 'whatsapp_reminder_10m')
      .eq('channel', 'whatsapp')
      .eq('status', 'failed')
      .lt('attempt_count', MAX_REMINDER_ATTEMPTS)
      .gte('created_at', new Date(nowMs - 6 * 60 * 60_000).toISOString());

    for (const f of failed || []) {
      const { data: meet } = await supabaseAdmin.from('meetings').select('*').eq('id', f.meeting_id).maybeSingle();
      if (!meet || meet.status !== 'planned' || meet.whatsapp_reminder_sent) continue;
      const untilStart = new Date(meet.start_time).getTime() - nowMs;
      if (untilStart < 0 || untilStart > 20 * 60_000) continue;

      const { data: student } = await supabaseAdmin.from('students').select('*').eq('id', meet.student_id).maybeSingle();
      const isim =
        studentIsim(student) ||
        String(f.payload?.isim || '').trim() ||
        'Öğrenci';

      try {
        const r = await deliverWhatsAppWithLog({
          meetingId: meet.id,
          kind: 'whatsapp_reminder_10m',
          recipientE164: f.recipient_e164,
          isim,
          coachId: meet.coach_id || student?.coach_id || null
        });
        if (r.ok && !r.skipped) {
          await supabaseAdmin
            .from('meetings')
            .update({ whatsapp_reminder_sent: true, updated_at: new Date().toISOString() })
            .eq('id', meet.id);
        }
        log.push({ retry: meet.id, isim, r });
      } catch {}
    }

    return res.status(200).json({ ok: true, force, processed: log.length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg, log });
  }
}
