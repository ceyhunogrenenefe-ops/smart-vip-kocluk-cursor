import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendAutomationTemplateMessage } from './whatsapp-automation-channel.js';
import { getIstanbulDateString } from './istanbul-time.js';

function formatTrDate(isoDate) {
  if (!isoDate) return '';
  const s = String(isoDate).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}.${m}.${y}`;
}

function formatTimeHm(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

const LINK_BINDING_KEYS = new Set(['link', 'baglanti', 'meeting_link']);

export function templateBindingsNeedLink(templateRow) {
  const raw = templateRow?.twilio_variable_bindings ?? templateRow?.variables;
  if (!Array.isArray(raw)) return false;
  return raw.some((v) => LINK_BINDING_KEYS.has(String(v || '').trim().toLowerCase().replace(/\s+/g, '_')));
}

export function resolveEventMeetingLink(event) {
  const direct = String(event?.meeting_link || '').trim();
  if (direct) return direct;
  const tv = event?.template_vars && typeof event.template_vars === 'object' ? event.template_vars : {};
  return String(tv.meeting_link || tv.link || tv.baglanti || '').trim();
}

export function buildEventTemplateVars(event, participant) {
  const tarih = formatTrDate(event.event_date) || 'Belirtilmedi';
  const saat = formatTimeHm(event.event_time) || 'Belirtilmedi';
  const etkinlik = String(event.title || '').trim();
  const link = resolveEventMeetingLink(event);
  const konum = String(event.location || '').trim();
  const aciklama = String(event.description || '').trim();
  const ad = String(participant.display_name || '').trim();
  const base = {
    ad,
    isim: ad,
    name: ad,
    ogrenci: ad,
    ogrenci_adi: ad,
    veli: ad,
    student_name: ad,
    etkinlik,
    etkinlik_adi: etkinlik,
    deneme_adi: etkinlik,
    sinav_adi: etkinlik,
    baslik: etkinlik,
    title: etkinlik,
    tarih,
    date: tarih,
    lesson_date: tarih,
    saat,
    time: saat,
    lesson_time: saat,
    link,
    baglanti: link,
    meeting_link: link,
    konum,
    location: konum,
    aciklama,
    description: aciklama
  };
  const extras = event.template_vars && typeof event.template_vars === 'object' ? event.template_vars : {};
  for (const [key, raw] of Object.entries(extras)) {
    const v = String(raw ?? '').trim();
    if (v) base[key] = v;
  }
  return base;
}

async function sendParticipantWhatsApp(event, participant, templateType, templateRow) {
  const phone = normalizePhoneToE164(participant.phone);
  if (!phone) {
    return { ok: false, error: 'invalid_phone' };
  }
  const vars = buildEventTemplateVars(event, participant);
  const sent = templateRow?.content
    ? await sendAutomationTemplateMessage({ phone, templateRow, vars, templateType })
    : { ok: false, channel: 'none', error: 'template_not_found' };
  const today = getIstanbulDateString();
  const preview = sent.bodyPreview || `[${templateType}] ${participant.display_name}`;
  const messageId = sent.sid || sent.meta_message_id || sent.gateway_message_id || null;
  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: participant.student_id || null,
      kind: 'institution_event_invite',
      related_id: event.id,
      message: preview,
      status: sent.ok ? 'sent' : 'failed',
      log_date: today,
      error: sent.ok ? null : sent.error || null,
      phone,
      meta_message_id: messageId,
      meta_template_name: sent.meta_template_name || templateType || null
    });
  } catch (e) {
    console.warn('[institution-event-send] message_log', e?.message || e);
  }
  return sent;
}

/** message_logs'ta sent kaydı var ama katılımcı hâlâ pending — UI «bekliyor» sapmasını düzeltir. */
export async function reconcileEventParticipantStatuses(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return 0;

  const { data: participants, error } = await supabaseAdmin
    .from('institution_event_participants')
    .select('id, phone, whatsapp_status')
    .eq('event_id', id)
    .in('whatsapp_status', ['pending', 'failed']);
  if (error || !participants?.length) return 0;

  let fixed = 0;
  for (const p of participants) {
    const phone = normalizePhoneToE164(p.phone);
    if (!phone) continue;
    const { data: log } = await supabaseAdmin
      .from('message_logs')
      .select('id, sent_at')
      .eq('kind', 'institution_event_invite')
      .eq('related_id', id)
      .eq('status', 'sent')
      .eq('phone', phone)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!log) continue;
    const { error: updErr } = await supabaseAdmin
      .from('institution_event_participants')
      .update({
        whatsapp_status: 'sent',
        whatsapp_error: null,
        whatsapp_sent_at: log.sent_at || new Date().toISOString()
      })
      .eq('id', p.id);
    if (!updErr) fixed += 1;
  }
  return fixed;
}

/** @param {{ resendAll?: boolean, participantIds?: string[]|null }} opts */
export async function sendEventInvites(event, opts = {}) {
  const participantIds = opts.participantIds ?? null;
  const resendAll = opts.resendAll === true;

  let q = supabaseAdmin.from('institution_event_participants').select('*').eq('event_id', event.id);
  if (Array.isArray(participantIds) && participantIds.length) {
    q = q.in('id', participantIds);
  } else if (!resendAll) {
    q = q.in('whatsapp_status', ['pending', 'failed']);
  }
  const { data: rows, error } = await q;
  if (error) throw error;

  const templateType = String(event.template_type || '').trim();
  if (!templateType) {
    return { ok: false, error: 'template_type_required', results: [] };
  }

  const { data: templateRow } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', templateType)
    .maybeSingle();

  const results = [];
  for (const p of rows || []) {
    const sent = await sendParticipantWhatsApp(event, p, templateType, templateRow);
    const patch = {
      whatsapp_status: sent.ok ? 'sent' : 'failed',
      whatsapp_error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 500),
      whatsapp_sent_at: sent.ok ? new Date().toISOString() : p.whatsapp_sent_at,
      meta_message_id: sent.ok
        ? sent.sid || sent.meta_message_id || sent.gateway_message_id || null
        : p.meta_message_id
    };
    const { error: updErr } = await supabaseAdmin
      .from('institution_event_participants')
      .update(patch)
      .eq('id', p.id);
    if (updErr) {
      console.warn('[institution-event-send] participant update', updErr.message);
    }
    results.push({
      participant_id: p.id,
      display_name: p.display_name,
      ok: sent.ok,
      channel: sent.channel || null,
      error: sent.ok ? null : sent.error
    });
  }
  const sentCount = results.filter((r) => r.ok).length;
  const failCount = results.length - sentCount;
  return {
    ok: failCount === 0,
    sent: sentCount,
    failed: failCount,
    channel: templateRow?.content ? results.find((r) => r.channel)?.channel || null : null,
    results
  };
}

export function aggregateParticipantStats(participants) {
  const stats = { total: 0, sent: 0, failed: 0, pending: 0 };
  for (const p of participants || []) {
    stats.total++;
    const st = String(p.whatsapp_status || 'pending');
    if (st === 'sent') stats.sent++;
    else if (st === 'failed') stats.failed++;
    else stats.pending++;
  }
  return stats;
}
