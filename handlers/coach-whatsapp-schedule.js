import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const DEFAULT_TEMPLATE =
  'Merhaba {{name}}, ben {{coach}}. Bugün hedeflerine odaklanmanı hatırlatıyorum. Kolay gelsin!';

function num(v, def, min, max) {
  const n = v === undefined || v === null || v === '' ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function bool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function resolveCampaignStartedAt(prev, isActive, campaignDays, restartCampaign) {
  if (!isActive || campaignDays == null) return null;

  const prevActive = prev?.is_active === true;
  const prevCd = prev?.campaign_days ?? null;
  const prevStarted = prev?.campaign_started_at ?? null;

  if (restartCampaign) return new Date().toISOString();
  if (!prevActive) return new Date().toISOString();
  if (prevCd == null && campaignDays != null) return new Date().toISOString();
  if (prevStarted) return prevStarted;
  return new Date().toISOString();
}

export default async function handler(req, res) {
  try {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'Missing token' });
    }
    actor = await enrichStudentActor(actor);

    if (actor.role !== 'coach' && actor.role !== 'teacher') {
      return res.status(403).json({
        error: 'coach_only',
        code: 'wrong_role',
        hint: 'Bu uç yalnızca koç veya öğretmen içindir.'
      });
    }
    if (!actor.coach_id) {
      return res.status(403).json({
        error: 'coach_only',
        code: 'no_coach_id',
        hint:
          'users ile coaches e-postası eşleşmiyor veya coaches kaydı yok. Yönetici panelinde koç e-postasını kullanıcıyla aynı yapın; ardından çıkış yapıp yeniden giriş yapın.'
      });
    }

    const coachId = String(actor.coach_id);

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('coach_whatsapp_schedules')
        .select('*')
        .eq('coach_id', coachId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(200).json({
          data: {
            coach_id: coachId,
            is_active: false,
            message_template: DEFAULT_TEMPLATE,
            send_hour_tr: 9,
            send_minute_tr: 0,
            weekdays_only: false,
            interval_days: 1,
            campaign_days: null,
            campaign_started_at: null,
            prefer_parent_phone: false
          }
        });
      }
      return res.status(200).json({ data });
    }

    if (req.method === 'PUT') {
      const b = req.body || {};

      const { data: prev } = await supabaseAdmin
        .from('coach_whatsapp_schedules')
        .select('is_active,campaign_started_at,campaign_days')
        .eq('coach_id', coachId)
        .maybeSingle();

      const isActive = bool(b.is_active);
      const restartCampaign = bool(b.restart_campaign);

      let campaignDays = null;
      if (
        b.campaign_days !== null &&
        b.campaign_days !== undefined &&
        String(b.campaign_days).trim() !== ''
      ) {
        const n = Number(b.campaign_days);
        if (Number.isFinite(n)) campaignDays = Math.min(3650, Math.max(1, Math.floor(n)));
      }

      const campaignStartedAt = resolveCampaignStartedAt(
        prev,
        isActive,
        campaignDays,
        restartCampaign
      );

      const messageTemplate =
        typeof b.message_template === 'string' && b.message_template.trim().length > 0
          ? b.message_template.trim().slice(0, 4000)
          : DEFAULT_TEMPLATE;

      const payload = {
        coach_id: coachId,
        is_active: isActive,
        message_template: messageTemplate,
        send_hour_tr: num(b.send_hour_tr, 9, 0, 23),
        send_minute_tr: num(b.send_minute_tr, 0, 0, 59),
        weekdays_only: bool(b.weekdays_only),
        interval_days: num(b.interval_days, 1, 1, 365),
        campaign_days: campaignDays,
        campaign_started_at: campaignStartedAt,
        prefer_parent_phone: bool(b.prefer_parent_phone),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('coach_whatsapp_schedules')
        .upsert(payload, { onConflict: 'coach_id' })
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'handler_failed';
    return res.status(500).json({ error: msg });
  }
}
