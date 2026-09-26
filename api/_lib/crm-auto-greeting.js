/**
 * Otomatik Karşılama ve Lead Toplama — yürütme katmanı.
 *
 * Yeni bir aday mesaj yazdığında karşılar, sınıfını ve uygun arama saatini
 * öğrenir, lead kaydına işler ve satış ekibine görev açar.
 *
 * GÜVENLİK KURALLARI
 * - Modül kurum başına ve VARSAYILAN KAPALI. Yönetici açmadan tek mesaj gitmez.
 * - Aynı sohbette karşılama yalnız bir kez yapılır (oturum kaydı).
 * - Temsilci sohbete yazdığı anda bot susar.
 * - Kurum içi kişiler (öğrenci / veli / personel) akışa alınmaz.
 * - Mevcut mesajlaşma, webhook ve lead akışlarına dokunulmaz; bu katman yalnız
 *   gelen mesajdan sonra çağrılır ve hata verirse sessizce geçer.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { getIstanbulDateString } from './istanbul-time.js';
import {
  DEFAULT_CALL_SLOTS,
  DEFAULT_CALL_TIME_TEXT,
  DEFAULT_CLOSING_TEXT,
  DEFAULT_GREETING_TEXT,
  GRADE_OPTIONS,
  PREFER_MESSAGE_OPTION,
  isChannelEnabled,
  isWithinRunWindow,
  nextFlowAction,
  numberedOptions
} from './crm-auto-greeting-core.js';

export { GRADE_OPTIONS, DEFAULT_CALL_SLOTS };

/** Istanbul saatine göre "HH:MM". */
export function istanbulHhmm(date = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

const SETTINGS_TABLE = 'crm_auto_greeting_settings';
const SESSION_TABLE = 'crm_auto_greeting_sessions';
const LOG_TABLE = 'crm_auto_greeting_logs';

function tableMissing(error) {
  const msg = String(error?.message || '');
  return /does not exist|schema cache|relation .* does not exist/i.test(msg);
}

/** Kurum ayarları; satır yoksa modül kapalı sayılır. */
export async function getAutoGreetingSettings(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from(SETTINGS_TABLE)
      .select('*')
      .eq('institution_id', id)
      .maybeSingle();
    if (error) {
      if (tableMissing(error)) return null;
      throw error;
    }
    return data || null;
  } catch (e) {
    console.warn('[auto-greeting] ayar okunamadı:', errorMessage(e));
    return null;
  }
}

export async function saveAutoGreetingSettings(institutionId, patch = {}, actorId = null) {
  const id = String(institutionId || '').trim();
  if (!id) throw new Error('institution_required');
  const allowed = [
    'is_active',
    'channel_whatsapp',
    'channel_instagram',
    'channel_facebook',
    'run_mode',
    'business_start',
    'business_end',
    'custom_start',
    'custom_end',
    'greeting_text',
    'call_time_text',
    'closing_text',
    'call_slots'
  ];
  const row = { institution_id: id, updated_by: actorId || null, updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (patch[key] !== undefined) row[key] = patch[key];
  }
  const { error } = await supabaseAdmin.from(SETTINGS_TABLE).upsert(row, { onConflict: 'institution_id' });
  if (error) throw error;
  return getAutoGreetingSettings(id);
}

async function logEvent({ institutionId, conversationId, leadId, event, detail = null }) {
  try {
    await supabaseAdmin.from(LOG_TABLE).insert({
      institution_id: institutionId || null,
      conversation_id: conversationId || null,
      lead_id: leadId || null,
      event: String(event || '').slice(0, 80),
      detail: detail || null
    });
  } catch (e) {
    if (!tableMissing(e)) console.warn('[auto-greeting] log:', errorMessage(e));
  }
}

async function getSession(conversationId) {
  try {
    const { data, error } = await supabaseAdmin
      .from(SESSION_TABLE)
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (error) {
      if (tableMissing(error)) return null;
      throw error;
    }
    return data || null;
  } catch (e) {
    console.warn('[auto-greeting] oturum:', errorMessage(e));
    return null;
  }
}

async function upsertSession(row) {
  const { data, error } = await supabaseAdmin
    .from(SESSION_TABLE)
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'conversation_id' })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Temsilci sohbete yazdı: bot susar. */
export async function markHumanTakeover(conversationId, { reason = 'agent_reply' } = {}) {
  const id = String(conversationId || '').trim();
  if (!id) return { ok: false };
  try {
    const session = await getSession(id);
    if (!session || session.human_takeover_at) return { ok: true, changed: false };
    await supabaseAdmin
      .from(SESSION_TABLE)
      .update({
        human_takeover_at: new Date().toISOString(),
        stopped_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', id);
    await logEvent({
      institutionId: session.institution_id,
      conversationId: id,
      leadId: session.lead_id,
      event: 'human_takeover',
      detail: { reason }
    });
    return { ok: true, changed: true };
  } catch (e) {
    console.warn('[auto-greeting] devir:', errorMessage(e));
    return { ok: false, error: errorMessage(e) };
  }
}

/** Temsilci otomatik akışı yeniden başlatır. */
export async function resumeAutoFlow(conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) return { ok: false };
  const session = await getSession(id);
  if (!session) return { ok: false, error: 'session_not_found' };
  await supabaseAdmin
    .from(SESSION_TABLE)
    .update({ human_takeover_at: null, stopped_reason: null, updated_at: new Date().toISOString() })
    .eq('conversation_id', id);
  await logEvent({
    institutionId: session.institution_id,
    conversationId: id,
    leadId: session.lead_id,
    event: 'flow_resumed'
  });
  return { ok: true };
}

/** Kanala göre mesaj gönderir. */
async function sendByChannel({ conversation, text, institutionId }) {
  const channel = String(conversation?.channel || '').toLowerCase();
  const contact = String(conversation?.contact_identifier || '').trim();
  if (!contact || !text) return { ok: false, error: 'missing_target' };

  if (channel === 'whatsapp') {
    const { sendCrmWhatsAppText } = await import('./crm-inbox.js');
    await sendCrmWhatsAppText({ phone: contact, text, institutionId });
    return { ok: true };
  }
  if (channel === 'instagram' || channel === 'facebook') {
    const { sendCrmInstagramDm } = await import('./crm-inbox.js');
    await sendCrmInstagramDm({ igScopedId: contact, text });
    return { ok: true };
  }
  return { ok: false, error: `unsupported_channel:${channel}` };
}

/** Gönderilen otomatik mesaj sohbete de yazılır ki temsilci görsün. */
async function recordOutgoing({ conversation, text, institutionId }) {
  try {
    const { upsertCrmMessage } = await import('./crm-inbox.js');
    await upsertCrmMessage({
      channel: conversation.channel,
      contactIdentifier: conversation.contact_identifier,
      body: text,
      direction: 'outbound',
      senderType: 'bot',
      institutionId: institutionId || conversation.institution_id,
      leadId: conversation.lead_id || null
    });
  } catch (e) {
    console.warn('[auto-greeting] giden mesaj kaydı:', errorMessage(e));
  }
}

function buildGreetingMessage(settings) {
  const head = String(settings?.greeting_text || DEFAULT_GREETING_TEXT);
  return `${head}\n\n${numberedOptions(GRADE_OPTIONS)}`;
}

function buildCallTimeMessage(settings, programLabel) {
  const raw = String(settings?.call_time_text || DEFAULT_CALL_TIME_TEXT);
  const head = raw.replace(/\{program\}/g, programLabel || '');
  const slots = Array.isArray(settings?.call_slots) && settings.call_slots.length
    ? settings.call_slots
    : DEFAULT_CALL_SLOTS;
  return `${head}\n\n${numberedOptions([...slots, PREFER_MESSAGE_OPTION])}`;
}

/** Mesai bitmişse arama "yarın" için planlanır. */
function callDateFor(settings, nowHhmm) {
  const today = getIstanbulDateString();
  const endStr = String(settings?.business_end || '22:00');
  const [nh, nm] = String(nowHhmm).split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const nowMin = nh * 60 + (nm || 0);
  const endMin = eh * 60 + (em || 0);
  if (nowMin < endMin) return today;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Lead kaydına sınıf / arama bilgisini işler. */
async function updateLead({ leadId, gradeLabelText, slot, callDate, channel }) {
  if (!leadId) return;
  const patch = { updated_at: new Date().toISOString() };
  if (gradeLabelText) patch.grade_program = gradeLabelText;
  if (slot && callDate) {
    const startHour = String(slot).match(/(\d{1,2}):?(\d{2})?/);
    const hh = startHour ? String(startHour[1]).padStart(2, '0') : '10';
    patch.next_action_at = `${callDate}T${hh}:00:00+03:00`;
    patch.next_action_type = 'call_parent';
  }
  if (channel) patch.last_inbound_channel = channel;
  try {
    await supabaseAdmin.from('registration_leads').update(patch).eq('id', leadId);
  } catch (e) {
    console.warn('[auto-greeting] lead güncelleme:', errorMessage(e));
  }
}

/** Satış ekibine arama görevi açar (aynı lead için tekrar açılmaz). */
async function createCallTask({ leadId, institutionId, assignedTo, contactName, gradeLabelText, slot, callDate }) {
  if (!leadId) return null;
  const title = `${gradeLabelText || 'Aday'} – ${contactName || 'Yeni lead'} – ${slot} arasında aranacak`;
  const startHour = String(slot).match(/(\d{1,2})/);
  const hh = startHour ? String(startHour[1]).padStart(2, '0') : '10';
  try {
    const { error } = await supabaseAdmin.from('registration_tasks').insert({
      lead_id: leadId,
      institution_id: institutionId || null,
      assigned_to: assignedTo || null,
      title: title.slice(0, 300),
      description: 'Otomatik karşılama akışında müşteri bu saat aralığını seçti.',
      task_type: 'call_parent',
      priority: 'high',
      status: 'pending',
      due_at: `${callDate}T${hh}:00:00+03:00`,
      deduplication_key: `auto-greeting:${leadId}:${callDate}:${slot}`,
      auto_generated: true
    });
    if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
    return title;
  } catch (e) {
    console.warn('[auto-greeting] görev:', errorMessage(e));
    return null;
  }
}

/** Konuşmaya etiket ekler (mevcut etiketler korunur). */
async function addTags(conversation, tags) {
  try {
    const meta = conversation.metadata && typeof conversation.metadata === 'object' ? { ...conversation.metadata } : {};
    const current = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
    const next = [...new Set([...current, ...tags.filter(Boolean)])].slice(0, 20);
    meta.tags = next;
    await supabaseAdmin
      .from('crm_conversations')
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
  } catch (e) {
    console.warn('[auto-greeting] etiket:', errorMessage(e));
  }
}

/**
 * Gelen mesaj için otomatik akışı yürütür.
 * Hiçbir koşul sağlanmazsa sessizce çıkar — mevcut davranış değişmez.
 *
 * @param {object} args
 * @param {object} args.conversation crm_conversations satırı
 * @param {string} args.body gelen mesaj metni
 * @returns {Promise<{ran: boolean, action?: string, reason?: string}>}
 */
export async function runAutoGreetingFlow({ conversation, body }) {
  try {
    if (!conversation?.id) return { ran: false, reason: 'no_conversation' };
    if (conversation.is_internal) return { ran: false, reason: 'internal_contact' };

    const institutionId = conversation.institution_id ? String(conversation.institution_id) : '';
    const settings = await getAutoGreetingSettings(institutionId);
    if (!settings || settings.is_active !== true) return { ran: false, reason: 'module_disabled' };
    if (!isChannelEnabled(settings, conversation.channel)) return { ran: false, reason: 'channel_disabled' };

    const nowHhmm = istanbulHhmm();
    const session = await getSession(conversation.id);

    // Çalışma penceresi yalnız AKIŞI BAŞLATIRKEN bakılır; başlamış akış
    // mesai içinde de tamamlanabilsin (müşteri yarım bırakmasın).
    if (!session && !isWithinRunWindow(settings, nowHhmm)) {
      return { ran: false, reason: 'outside_window' };
    }

    const decision = nextFlowAction({
      session,
      body,
      slots: Array.isArray(settings.call_slots) ? settings.call_slots : DEFAULT_CALL_SLOTS
    });
    if (decision.action === 'ignore') return { ran: false, reason: decision.reason };

    const base = {
      conversation_id: conversation.id,
      institution_id: institutionId || null,
      lead_id: conversation.lead_id || null,
      channel: String(conversation.channel || '')
    };

    if (decision.action === 'greet') {
      const text = buildGreetingMessage(settings);
      const sent = await sendByChannel({ conversation, text, institutionId });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'greet', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text, institutionId });
      await upsertSession({ ...base, step: 'grade_asked' });
      await addTags(conversation, ['Yeni Lead', 'Otomatik karşılama']);
      await logEvent({ ...base, event: 'greeting_sent' });
      return { ran: true, action: 'greet' };
    }

    if (decision.action === 'ask_slot') {
      const label = decision.grade.label;
      const text = buildCallTimeMessage(settings, label);
      const sent = await sendByChannel({ conversation, text, institutionId });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'ask_slot', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text, institutionId });
      await upsertSession({ ...base, step: 'slot_asked', grade_program: label });
      await updateLead({
        leadId: conversation.lead_id,
        gradeLabelText: label,
        channel: conversation.channel
      });
      await addTags(conversation, ['Yeni Lead', label]);
      await logEvent({ ...base, event: 'grade_detected', detail: decision.grade });
      return { ran: true, action: 'ask_slot' };
    }

    if (decision.action === 'complete') {
      const slot = decision.slot.slot;
      const prefersMessage = Boolean(decision.slot.prefersMessage);
      const callDate = callDateFor(settings, nowHhmm);
      const closing = String(settings.closing_text || DEFAULT_CLOSING_TEXT);
      const sent = await sendByChannel({ conversation, text: closing, institutionId });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'complete', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text: closing, institutionId });

      const label = session?.grade_program || '';
      await upsertSession({
        ...base,
        step: 'completed',
        grade_program: label || null,
        call_slot: slot,
        call_date: prefersMessage ? null : callDate,
        completed_at: new Date().toISOString()
      });

      if (!prefersMessage) {
        await updateLead({
          leadId: conversation.lead_id,
          gradeLabelText: label,
          slot,
          callDate,
          channel: conversation.channel
        });
        const taskTitle = await createCallTask({
          leadId: conversation.lead_id,
          institutionId,
          assignedTo: conversation.assigned_user_id || null,
          contactName: conversation.contact_name || conversation.contact_username,
          gradeLabelText: label,
          slot,
          callDate
        });
        await addTags(conversation, ['Arama Talebi', `${slot} Aranacak`]);
        await logEvent({ ...base, event: 'task_created', detail: { slot, callDate, taskTitle } });
      } else {
        await addTags(conversation, ['Mesajla bilgi']);
        await logEvent({ ...base, event: 'prefers_message' });
      }

      await logEvent({ ...base, event: 'flow_completed', detail: { slot, prefersMessage } });
      return { ran: true, action: 'complete' };
    }

    return { ran: false, reason: 'no_action' };
  } catch (e) {
    console.warn('[auto-greeting] akış:', errorMessage(e));
    return { ran: false, reason: 'error', error: errorMessage(e) };
  }
}
