/**
 * Edesis webhook — App.Exam.ResultsPublished
 * POST /api/edesis-webhook
 * İmza: X-Edesis-Webhook-Secret veya ?token=  == EDESIS_WEBHOOK_SECRET (yoksa EDESIS_API_KEY)
 */
import crypto from 'crypto';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { applyCors, handleCorsPreflight } from '../api/_lib/cors-mobile.js';
import { runSync } from './edesis-sync.js';

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function expectedSecret() {
  return String(process.env.EDESIS_WEBHOOK_SECRET || process.env.EDESIS_API_KEY || '').trim();
}

function providedSecret(req) {
  return String(
    req.headers['x-edesis-webhook-secret'] ||
      req.headers['x-webhook-secret'] ||
      req.query?.token ||
      req.body?.secret ||
      ''
  ).trim();
}

function eventIdFrom(body, headers) {
  return String(
    body?.eventId ||
      body?.id ||
      body?.EventId ||
      headers['x-edesis-event-id'] ||
      `${body?.eventType || body?.type || 'event'}:${body?.examId || body?.ExamId || Date.now()}`
  ).trim();
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = expectedSecret();
  if (!secret) {
    return res.status(401).json({
      error: 'webhook_secret_missing',
      hint: 'Vercel: EDESIS_WEBHOOK_SECRET tanımlayın'
    });
  }
  if (!timingSafeEqual(providedSecret(req), secret)) {
    return res.status(401).json({ error: 'invalid_webhook_signature' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const eventType = String(body.eventType || body.type || body.event || 'App.Exam.ResultsPublished').trim();
  const eventId = eventIdFrom(body, req.headers);

  try {
    const { data: existing } = await supabaseAdmin
      .from('webhook_events')
      .select('id, status')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existing?.status === 'processed') {
      return res.status(200).json({ ok: true, duplicate: true, eventId });
    }

    const { error: insErr } = await supabaseAdmin.from('webhook_events').upsert(
      {
        event_id: eventId,
        event_type: eventType,
        payload: body,
        status: 'received'
      },
      { onConflict: 'event_id' }
    );
    if (insErr && !isMissingTableError(insErr, 'webhook_events')) throw insErr;

    const isResults =
      /results?published|exam\.results|sonuc/i.test(eventType) || Boolean(body.examId || body.ExamId);
    if (/attendance|yoklama|homework|odev|schedule|program|guidance|rehberlik/i.test(eventType)) {
      await supabaseAdmin
        .from('webhook_events')
        .update({ status: 'ignored', processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      return res.status(200).json({ ok: true, eventId, ignored: true, reason: 'attendance_or_write_event' });
    }
    if (isResults) {
      const sync = await runSync({ institution_id: null, role: 'cron' });
      await supabaseAdmin
        .from('webhook_events')
        .update({
          status: sync?.ok ? 'processed' : 'failed',
          processed_at: new Date().toISOString(),
          error_message: sync?.ok ? null : sync?.error || sync?.diagnosis || null
        })
        .eq('event_id', eventId);
      return res.status(200).json({ ok: Boolean(sync?.ok), eventId, synced: sync?.imported || 0 });
    }

    await supabaseAdmin
      .from('webhook_events')
      .update({ status: 'ignored', processed_at: new Date().toISOString() })
      .eq('event_id', eventId);
    return res.status(200).json({ ok: true, eventId, ignored: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: errorMessage(e) });
  }
}
