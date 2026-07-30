import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  getGatewaySessionStatus,
  sendGatewayTextMessage,
  warmGatewaySession
} from '../api/_lib/whatsapp-gateway-send.js';
import {
  loadScopedClasses,
  loadClassStudentsForBulk,
  resolveGatewayBulkRecipients
} from '../api/_lib/whatsapp-gateway-bulk-scope.js';

const GW_BULK_LABEL_PREFIX = 'GW_BULK:';
const SEND_DELAY_MS = 400;

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

function parseClassIds(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x || '').trim()).filter(Boolean))];
}

function parseChannel(v) {
  return String(v || '').trim().toLowerCase() === 'parent' ? 'parent' : 'student';
}

/** null = tümü; dizi = kısmi (boş dizi = kimse) */
function parseOptionalStudentIds(body) {
  if (body.student_ids === undefined || body.student_ids === null) return null;
  if (!Array.isArray(body.student_ids)) return null;
  return [...new Set(body.student_ids.map((x) => String(x || '').trim()).filter(Boolean))];
}

function canUseBulk(actor, roleSet) {
  return (
    roleSet.has('coach') ||
    roleSet.has('teacher') ||
    roleSet.has('admin') ||
    roleSet.has('super_admin')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureGatewayConnected(sessionId) {
  const st = await getGatewaySessionStatus(sessionId, { skipHealth: false });
  if (st.ok && st.status === 'connected') return { ok: true };
  const warmed = await warmGatewaySession(sessionId, { waitMs: 10000 });
  if (warmed.ok) return { ok: true };
  return {
    ok: false,
    error: 'gateway_not_connected',
    hint: 'Aktif Gateway bağlantısı bulunamadı. Lütfen Gateway bağlantınızı kontrol edin.'
  };
}

async function logBulkMessage({ actor, studentId, phone, message, status, error, channel }) {
  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: studentId,
      kind: channel === 'parent' ? 'gateway_bulk_parent' : 'gateway_bulk',
      related_id: null,
      message: String(message || '').slice(0, 500),
      recipient_e164: phone,
      status: status === 'sent' ? 'sent' : 'failed',
      last_error: error ? String(error).slice(0, 500) : null,
      created_by: actor.sub,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[gateway-bulk] message_logs insert', e?.message || e);
  }
}

function recipientOpts(body) {
  return {
    channel: parseChannel(body.channel),
    studentIds: parseOptionalStudentIds(body)
  };
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const roles = await normalizedUserRolesFromDb(actor.sub);
  const roleSet = new Set(roles.map((r) => String(r || '').toLowerCase()));
  if (!canUseBulk(actor, roleSet)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const body = parseBody(req);
  const action = String(req.query?.action || body.action || '').trim().toLowerCase();

  if (req.method === 'GET' && (!action || action === 'classes')) {
    try {
      const classes = await loadScopedClasses(actor);
      return res.status(200).json({ data: classes });
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'classes_load_failed' });
    }
  }

  if (req.method === 'GET' && action === 'plans') {
    if (!actor.coach_id) {
      return res.status(200).json({ data: [], hint: 'coach_id_required_for_plans' });
    }
    const { data, error } = await supabaseAdmin
      .from('coach_whatsapp_gateway_schedules')
      .select('*')
      .eq('coach_id', String(actor.coach_id))
      .like('label', `${GW_BULK_LABEL_PREFIX}%`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json({ data: data || [] });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const classIds = parseClassIds(body.class_ids);
  const opts = recipientOpts(body);

  if (action === 'class-students') {
    const result = await loadClassStudentsForBulk(actor, classIds, opts.channel);
    if (!result.ok) {
      return res.status(result.error === 'class_forbidden' ? 403 : 400).json(result);
    }
    return res.status(200).json({
      data: result.students,
      channel: result.channel
    });
  }

  if (action === 'preview') {
    const result = await resolveGatewayBulkRecipients(actor, classIds, opts);
    if (!result.ok) {
      const status =
        result.error === 'class_forbidden' || result.error === 'student_forbidden' ? 403 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json({
      total: result.total,
      channel: result.channel,
      recipients: (result.recipients || []).map((r) => ({
        student_id: r.student_id,
        name: r.name,
        channel: r.channel
      }))
    });
  }

  if (action === 'send') {
    const message = String(body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message_required' });
    }

    const resolved = await resolveGatewayBulkRecipients(actor, classIds, opts);
    if (!resolved.ok) {
      const status =
        resolved.error === 'class_forbidden' || resolved.error === 'student_forbidden' ? 403 : 400;
      return res.status(status).json(resolved);
    }
    if (!resolved.total) {
      return res.status(400).json({
        error: 'no_recipients',
        hint:
          opts.channel === 'parent'
            ? 'Seçimde aktif ve geçerli veli telefonu bulunan kişi yok.'
            : 'Seçimde aktif ve telefonu geçerli öğrenci bulunamadı.'
      });
    }

    const sessionId = String(actor.sub || '').trim();
    const gw = await ensureGatewayConnected(sessionId);
    if (!gw.ok) {
      return res.status(409).json(gw);
    }

    let sent = 0;
    let failed = 0;
    const details = [];

    for (const rec of resolved.recipients || []) {
      try {
        const result = await sendGatewayTextMessage({
          phone: rec.phone_e164,
          message,
          sessionId,
          sessionCandidates: [sessionId],
          allowSharedFallback: false
        });
        if (result?.ok) {
          sent += 1;
          await logBulkMessage({
            actor,
            studentId: rec.student_id,
            phone: rec.phone_e164,
            message,
            status: 'sent',
            channel: rec.channel
          });
          details.push({ student_id: rec.student_id, status: 'sent', channel: rec.channel });
        } else {
          failed += 1;
          await logBulkMessage({
            actor,
            studentId: rec.student_id,
            phone: rec.phone_e164,
            message,
            status: 'failed',
            error: result?.error || 'send_failed',
            channel: rec.channel
          });
          details.push({
            student_id: rec.student_id,
            status: 'failed',
            error: result?.error,
            channel: rec.channel
          });
        }
      } catch (e) {
        failed += 1;
        const errMsg = e instanceof Error ? e.message : String(e);
        await logBulkMessage({
          actor,
          studentId: rec.student_id,
          phone: rec.phone_e164,
          message,
          status: 'failed',
          error: errMsg,
          channel: rec.channel
        });
        details.push({
          student_id: rec.student_id,
          status: 'failed',
          error: errMsg,
          channel: rec.channel
        });
      }
      await sleep(SEND_DELAY_MS);
    }

    return res.status(200).json({
      ok: true,
      sent,
      failed,
      pending: 0,
      total: resolved.total,
      channel: resolved.channel,
      details
    });
  }

  if (action === 'schedule') {
    if (!actor.coach_id) {
      return res.status(403).json({
        error: 'coach_id_required',
        hint: 'Günlük plan için koç kaydı gerekir. Yönetici hesabıyla plan oluşturulamaz.'
      });
    }

    const message = String(body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message_required' });
    }

    const sendHour = Math.min(23, Math.max(0, Number(body.send_hour_tr ?? 9)));
    const sendMinute = Math.min(59, Math.max(0, Number(body.send_minute_tr ?? 0)));
    const channel = opts.channel;
    const studentIds = opts.studentIds;
    const labelRaw = String(body.label || 'Günlük toplu mesaj').trim().slice(0, 100);
    const label = labelRaw.startsWith(GW_BULK_LABEL_PREFIX) ? labelRaw : `${GW_BULK_LABEL_PREFIX} ${labelRaw}`;

    const resolved = await resolveGatewayBulkRecipients(actor, classIds, opts);
    if (!resolved.ok) {
      const status =
        resolved.error === 'class_forbidden' || resolved.error === 'student_forbidden' ? 403 : 400;
      return res.status(status).json(resolved);
    }

    const idempotencyKey = String(body.idempotency_key || '').trim();
    if (idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from('coach_whatsapp_gateway_schedules')
        .select('id')
        .eq('coach_id', String(actor.coach_id))
        .eq('label', label)
        .gte('created_at', new Date(Date.now() - 60_000).toISOString())
        .maybeSingle();
      if (existing?.id) {
        return res.status(200).json({ data: existing, duplicate: true });
      }
    }

    const row = {
      coach_id: String(actor.coach_id),
      label,
      is_active: body.is_active !== false,
      message_template: message.slice(0, 4000),
      send_hour_tr: sendHour,
      send_minute_tr: sendMinute,
      weekdays_only: false,
      interval_days: 1,
      campaign_days: null,
      campaign_started_at: null,
      prefer_parent_phone: channel === 'parent',
      recipient_channel: channel,
      repeat_mode: 'daily',
      send_date_tr: null,
      weekday_tr: null,
      // Kısmi seçim kaydedilir; boş = sınıfın tamamı (target_class_ids ile)
      target_student_ids: Array.isArray(studentIds) ? studentIds : [],
      target_class_ids: classIds,
      target_class_level: null,
      target_group_name: null,
      gateway_user_id: String(actor.sub || '').trim(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('coach_whatsapp_gateway_schedules')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(201).json({ data });
  }

  if (action === 'update-plan') {
    const planId = String(body.plan_id || '').trim();
    if (!planId || !actor.coach_id) {
      return res.status(400).json({ error: 'plan_id_required' });
    }
    const patch = { updated_at: new Date().toISOString() };
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    if (body.message !== undefined) patch.message_template = String(body.message).trim().slice(0, 4000);
    if (body.send_hour_tr !== undefined) patch.send_hour_tr = Math.min(23, Math.max(0, Number(body.send_hour_tr)));
    if (body.send_minute_tr !== undefined) {
      patch.send_minute_tr = Math.min(59, Math.max(0, Number(body.send_minute_tr)));
    }
    if (body.class_ids) patch.target_class_ids = parseClassIds(body.class_ids);
    if (body.channel !== undefined) {
      const ch = parseChannel(body.channel);
      patch.recipient_channel = ch;
      patch.prefer_parent_phone = ch === 'parent';
    }
    if (body.student_ids !== undefined) {
      patch.target_student_ids = parseOptionalStudentIds(body) || [];
    }

    const { data, error } = await supabaseAdmin
      .from('coach_whatsapp_gateway_schedules')
      .update(patch)
      .eq('id', planId)
      .eq('coach_id', String(actor.coach_id))
      .like('label', `${GW_BULK_LABEL_PREFIX}%`)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ data });
  }

  if (action === 'delete-plan') {
    const planId = String(body.plan_id || '').trim();
    if (!planId || !actor.coach_id) {
      return res.status(400).json({ error: 'plan_id_required' });
    }
    const { error } = await supabaseAdmin
      .from('coach_whatsapp_gateway_schedules')
      .delete()
      .eq('id', planId)
      .eq('coach_id', String(actor.coach_id))
      .like('label', `${GW_BULK_LABEL_PREFIX}%`);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'unknown_action' });
}
