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

function getScheduleIdFromReq(req) {
  const qid = req.query?.id;
  if (qid !== undefined && qid !== null && String(qid).trim()) {
    return String(Array.isArray(qid) ? qid[0] : qid).trim();
  }
  const extra = req.apiExtraSegments;
  if (Array.isArray(extra) && extra[0]) return String(extra[0]).trim();
  return '';
}

function parseRepeatMode(v, prev) {
  const raw = v != null && v !== '' ? String(v).trim().toLowerCase() : '';
  if (['once', 'daily', 'weekly', 'interval'].includes(raw)) return raw;
  return prev?.repeat_mode || 'daily';
}

function parseSendDateTr(v) {
  const s = String(v || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseWeekdayTr(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const wd = Math.floor(n);
  return wd >= 1 && wd <= 7 ? wd : null;
}

function parseTargetStudentIds(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 500);
}

function parseRecipientChannel(v, preferParent, prev) {
  const raw = String(v || '').trim().toLowerCase();
  if (raw === 'parent' || raw === 'student') return raw;
  if (preferParent === true || preferParent === 'true' || preferParent === 1) return 'parent';
  return prev?.recipient_channel || 'student';
}

function buildSchedulePayload(b, coachId, gatewayUserId, prev = null) {
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

  const label =
    b.label === null || b.label === undefined
      ? null
      : String(b.label || '').trim().slice(0, 120) || null;

  const repeatMode = parseRepeatMode(b.repeat_mode, prev);
  const sendDateTr = parseSendDateTr(b.send_date_tr);
  const weekdayTr = parseWeekdayTr(b.weekday_tr);
  const recipientChannel = parseRecipientChannel(
    b.recipient_channel,
    b.prefer_parent_phone,
    prev
  );

  const taskDefault =
    typeof b.task_default === 'string' && b.task_default.trim()
      ? b.task_default.trim().slice(0, 500)
      : null;

  const templateVarDate =
    b.template_var_date != null && String(b.template_var_date).trim()
      ? String(b.template_var_date).trim().slice(0, 120)
      : null;
  const templateVarTime =
    b.template_var_time != null && String(b.template_var_time).trim()
      ? String(b.template_var_time).trim().slice(0, 80)
      : null;
  const templateVarLink =
    b.template_var_link != null && String(b.template_var_link).trim()
      ? String(b.template_var_link).trim().slice(0, 500)
      : null;

  const targetClass =
    b.target_class_level != null && String(b.target_class_level).trim()
      ? String(b.target_class_level).trim().slice(0, 64)
      : null;
  const targetGroup =
    b.target_group_name != null && String(b.target_group_name).trim()
      ? String(b.target_group_name).trim().slice(0, 120)
      : null;

  return {
    coach_id: coachId,
    label,
    is_active: isActive,
    message_template: messageTemplate,
    send_hour_tr: num(b.send_hour_tr, prev?.send_hour_tr ?? 9, 0, 23),
    send_minute_tr: num(b.send_minute_tr, prev?.send_minute_tr ?? 0, 0, 59),
    weekdays_only: bool(b.weekdays_only),
    interval_days: num(b.interval_days, prev?.interval_days ?? 1, 1, 365),
    campaign_days: campaignDays,
    campaign_started_at: campaignStartedAt,
    prefer_parent_phone: recipientChannel === 'parent',
    recipient_channel: recipientChannel,
    repeat_mode: repeatMode,
    send_date_tr: repeatMode === 'once' ? sendDateTr : null,
    weekday_tr: repeatMode === 'weekly' ? weekdayTr : null,
    target_student_ids: parseTargetStudentIds(b.target_student_ids),
    target_class_level: targetClass,
    target_group_name: targetGroup,
    task_default: taskDefault,
    template_var_date: templateVarDate,
    template_var_time: templateVarTime,
    template_var_link: templateVarLink,
    gateway_user_id: gatewayUserId,
    updated_at: new Date().toISOString()
  };
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

    if (actor.role === 'super_admin' || actor.role === 'admin') {
      if (req.method === 'GET') {
        return res.status(200).json({
          data: [],
          hint:
            'Yönetici görünümü: gateway zamanlayıcılarını kaydetmek için koç veya öğretmen hesabıyla giriş yapın.'
        });
      }
      return res.status(403).json({
        error: 'admin_schedule_readonly',
        code: 'admin_schedule_readonly',
        hint:
          'Yönetici hesabıyla gateway zamanlayıcısı kaydedilemez. Koç veya öğretmen hesabıyla giriş yapın.'
      });
    }

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
          'users ile coaches e-postası eşleşmiyor veya coaches kaydı yok. Yönetici panelinde koç e-postasını kullanıcıyla aynı yapın.'
      });
    }

    const coachId = String(actor.coach_id);
    const gatewayUserId = String(actor.sub || '').trim();

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('coach_whatsapp_gateway_schedules')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const b = parseBody(req);
      const payload = buildSchedulePayload(b, coachId, gatewayUserId);
      const { data, error } = await supabaseAdmin
        .from('coach_whatsapp_gateway_schedules')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    const scheduleId = getScheduleIdFromReq(req);
    if (!scheduleId) {
      return res.status(400).json({ error: 'id_required' });
    }

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('coach_whatsapp_gateway_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('coach_id', coachId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (req.method === 'PUT') {
      const b = parseBody(req);
      const payload = buildSchedulePayload(b, coachId, gatewayUserId, existing);
      const { data, error } = await supabaseAdmin
        .from('coach_whatsapp_gateway_schedules')
        .update(payload)
        .eq('id', scheduleId)
        .eq('coach_id', coachId)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseAdmin
        .from('coach_whatsapp_gateway_schedules')
        .delete()
        .eq('id', scheduleId)
        .eq('coach_id', coachId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'handler_failed';
    return res.status(500).json({ error: msg });
  }
}
