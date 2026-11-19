/**
 * AI Satış Asistanı — yürütme katmanı.
 *
 * Akış: Meta webhook → upsertCrmMessage → onInboundMessage (hızlı kontrol,
 * kuyruğa al) → waitUntil içinde birkaç saniye bekle (art arda gelen mesajlar
 * toplansın) → processConversation → Claude (site bilgi tabanı + ton rehberi +
 * araçlar) → yanıt aynı kanaldan → crm_messages (bot) + lead kartı + görev.
 *
 * GÜVENLİK KURALLARI
 * - Modül kurum başına ve VARSAYILAN KAPALI.
 * - Yalnız panelde seçilen gün/saatlerde çalışır; dışında susar, ekip yanıtlar.
 * - Temsilci sohbete yazdığında ya da "İnsana devret"e basıldığında bot o sohbette susar.
 * - İlk yanıtta bot olduğunu ve KVKK aydınlatma metnini bildirir.
 * - 24 saat penceresi kapalıysa serbest metin göndermez.
 * - API anahtarı yalnız ortam değişkeninden okunur (ANTHROPIC_API_KEY).
 * - Hata olursa sessizce geçer; mevcut webhook / inbox akışını asla bozmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';
import {
  ALLOWED_EFFORTS,
  ALLOWED_MODELS,
  ASSISTANT_TOOLS,
  BOT_AUTHOR_ID,
  DEFAULT_KVKK_URL,
  DEFAULT_MODEL,
  DEFAULT_SCHEDULE,
  DEFAULT_SITE_URLS,
  HANDOVER_REPLY,
  buildDynamicContext,
  buildKvkkNotice,
  buildStaticSystemPrompt,
  buildToneExcerpt,
  computeFreeSlots,
  decideRun,
  displayTrPhone,
  gradeProgramCode,
  historyToMessages,
  htmlToText,
  mergeCollected,
  normalizeSchedule,
  normalizeTrPhone,
  parseChatExport,
  pickConsultant,
  runAssistantLoop,
  sanitizeSiteUrls,
  slotLabel,
  validateBooking
} from './crm-ai-assistant-core.js';

export const SETTINGS_TABLE = 'crm_ai_assistant_settings';
export const SESSION_TABLE = 'crm_ai_sessions';
export const LOG_TABLE = 'crm_ai_logs';
export const KB_TABLE = 'crm_ai_kb_pages';
export const TONE_TABLE = 'crm_ai_tone_sources';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function tableMissing(error) {
  if (!error) return false;
  if (['42P01', 'PGRST205'].includes(String(error.code || ''))) return true;
  return /does not exist|schema cache|PGRST205/i.test(String(error.message || ''));
}

export function instKey(institutionId) {
  return String(institutionId || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
}

export function isClaudeConfigured() {
  return Boolean(String(process.env.ANTHROPIC_API_KEY || '').trim());
}

let clientPromise = null;
async function claudeClient() {
  if (!isClaudeConfigured()) throw new Error('anthropic_api_key_missing — Vercel ortamına ANTHROPIC_API_KEY ekleyin');
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ maxRetries: 2, timeout: 90_000 }));
  }
  return clientPromise;
}

/** Claude çağrısı: reddedilirse sunucu tarafı yedek modele düşer (fallbacks: "default"). */
async function claudeCreate(params) {
  const client = await claudeClient();
  return client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' });
}

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

export function defaultSettings(institutionId) {
  return {
    institution_id: instKey(institutionId),
    is_active: false,
    channel_whatsapp: true,
    channel_instagram: true,
    primary_ig_only: true,
    schedule: normalizeSchedule(DEFAULT_SCHEDULE),
    model: DEFAULT_MODEL,
    effort: 'medium',
    kvkk_url: DEFAULT_KVKK_URL,
    site_urls: DEFAULT_SITE_URLS,
    consultant_user_ids: [],
    slot_minutes: 30,
    days_ahead: 3,
    min_lead_minutes: 60,
    max_bot_replies: 15,
    debounce_seconds: 8,
    extra_instructions: '',
    tone_guide: '',
    tone_guide_updated_at: null
  };
}

export async function getSettings(institutionId) {
  const inst = instKey(institutionId);
  const base = defaultSettings(inst);
  const { data, error } = await supabaseAdmin.from(SETTINGS_TABLE).select('*').eq('institution_id', inst).maybeSingle();
  if (error) {
    if (tableMissing(error)) return { ...base, table_missing: true };
    throw error;
  }
  if (!data) return base;
  const merged = { ...base, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)) };
  merged.schedule = normalizeSchedule(data.schedule);
  merged.site_urls = Array.isArray(data.site_urls) && data.site_urls.length ? data.site_urls : DEFAULT_SITE_URLS;
  merged.kvkk_url = data.kvkk_url || DEFAULT_KVKK_URL;
  return merged;
}

function clampInt(v, min, max, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/** Panelden gelen ayarları doğrular. Hatalıysa Error fırlatır. */
export function sanitizeSettingsPatch(patch = {}) {
  const row = {};
  for (const k of ['is_active', 'channel_whatsapp', 'channel_instagram', 'primary_ig_only']) {
    if (k in patch) row[k] = patch[k] === true;
  }
  if ('schedule' in patch) row.schedule = normalizeSchedule(patch.schedule);
  if ('model' in patch) {
    if (!ALLOWED_MODELS.includes(String(patch.model))) throw new Error('Geçersiz model');
    row.model = String(patch.model);
  }
  if ('effort' in patch) {
    if (!ALLOWED_EFFORTS.includes(String(patch.effort))) throw new Error('Geçersiz düşünme seviyesi');
    row.effort = String(patch.effort);
  }
  if ('kvkk_url' in patch) {
    const u = String(patch.kvkk_url || '').trim();
    if (u && !/^https:\/\/\S+$/i.test(u)) throw new Error('KVKK bağlantısı https:// ile başlamalı');
    row.kvkk_url = u || null;
  }
  if ('site_urls' in patch) {
    const list = Array.isArray(patch.site_urls)
      ? patch.site_urls
      : String(patch.site_urls || '').split(/\s+/);
    row.site_urls = sanitizeSiteUrls(list);
  }
  if ('consultant_user_ids' in patch) {
    row.consultant_user_ids = (Array.isArray(patch.consultant_user_ids) ? patch.consultant_user_ids : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  if ('slot_minutes' in patch) row.slot_minutes = clampInt(patch.slot_minutes, 15, 120, 30);
  if ('days_ahead' in patch) row.days_ahead = clampInt(patch.days_ahead, 1, 14, 3);
  if ('min_lead_minutes' in patch) row.min_lead_minutes = clampInt(patch.min_lead_minutes, 0, 24 * 60, 60);
  if ('max_bot_replies' in patch) row.max_bot_replies = clampInt(patch.max_bot_replies, 3, 50, 15);
  if ('debounce_seconds' in patch) row.debounce_seconds = clampInt(patch.debounce_seconds, 0, 30, 8);
  if ('extra_instructions' in patch) row.extra_instructions = String(patch.extra_instructions || '').slice(0, 4000);
  if ('tone_guide' in patch) {
    row.tone_guide = String(patch.tone_guide || '').slice(0, 8000);
    row.tone_guide_updated_at = new Date().toISOString();
  }
  return row;
}

export async function saveSettings(institutionId, patch = {}, actorId = null) {
  const inst = instKey(institutionId);
  const row = { ...sanitizeSettingsPatch(patch), institution_id: inst, updated_by: actorId, updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from(SETTINGS_TABLE).upsert(row, { onConflict: 'institution_id' });
  if (error) {
    if (tableMissing(error)) throw new Error('Tablolar yok — sql/2026-11-19-crm-ai-sales-assistant.sql dosyasını çalıştırın');
    throw error;
  }
  await logEvent({ institutionId: inst, event: 'settings_saved', detail: { by: actorId, keys: Object.keys(row) } });
  return getSettings(inst);
}

/* ------------------------------------------------------------------ */
/* Oturum / log                                                        */
/* ------------------------------------------------------------------ */

export async function logEvent({ institutionId = null, conversationId = null, leadId = null, event, detail = null, usage = null }) {
  try {
    await supabaseAdmin.from(LOG_TABLE).insert({
      institution_id: institutionId,
      conversation_id: conversationId,
      lead_id: leadId,
      event,
      detail,
      input_tokens: usage ? Number(usage.input_tokens || 0) + Number(usage.cache_read_input_tokens || 0) : null,
      output_tokens: usage ? Number(usage.output_tokens || 0) : null
    });
  } catch (e) {
    console.warn('[ai-assistant] log:', errorMessage(e));
  }
}

export async function getSession(conversationId) {
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
}

async function patchSession(conversationId, patch) {
  const { data, error } = await supabaseAdmin
    .from(SESSION_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/* Gelen mesaj → kuyruk                                                */
/* ------------------------------------------------------------------ */

async function runInBackground(task) {
  const p = Promise.resolve()
    .then(task)
    .catch((e) => console.warn('[ai-assistant] arka plan:', errorMessage(e)));
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(p);
  } catch {
    /* Vercel dışı ortam: söz yine çalışır */
  }
  return p;
}

/**
 * Gelen müşteri mesajından hemen sonra çağrılır (webhook içinde, hızlı).
 * @returns {Promise<{queued:boolean, owns:boolean, reason:string}>}
 *   owns: bu konuşma AI asistanın sorumluluğunda — Otomatik Karşılama çalışmasın.
 */
export async function onInboundMessage({ conversation, body }) {
  try {
    if (!conversation?.id || !String(body || '').trim()) return { queued: false, owns: false, reason: 'empty' };
    const settings = await getSettings(conversation.institution_id);
    if (settings.table_missing || settings.is_active !== true) return { queued: false, owns: false, reason: 'module_disabled' };
    const session = await getSession(conversation.id);
    const now = Date.now();
    const decision = decideRun({ settings, conversation, session, now, lastInboundAt: new Date(now).toISOString() });
    if (!decision.run) {
      if (session && decision.reason !== 'outside_schedule') {
        await logEvent({ institutionId: settings.institution_id, conversationId: conversation.id, leadId: conversation.lead_id, event: 'skipped', detail: { reason: decision.reason } });
      }
      return { queued: false, owns: Boolean(session), reason: decision.reason };
    }
    if (!isClaudeConfigured()) {
      await logEvent({ institutionId: settings.institution_id, conversationId: conversation.id, event: 'config_error', detail: { error: 'anthropic_api_key_missing' } });
      return { queued: false, owns: false, reason: 'api_key_missing' };
    }

    const pendingAt = new Date(now).toISOString();
    if (session) {
      await patchSession(conversation.id, { pending_at: pendingAt, lead_id: session.lead_id || conversation.lead_id || null });
    } else {
      const { error } = await supabaseAdmin.from(SESSION_TABLE).upsert(
        {
          conversation_id: conversation.id,
          institution_id: settings.institution_id,
          lead_id: conversation.lead_id || null,
          channel: String(conversation.channel || ''),
          state: 'active',
          pending_at: pendingAt
        },
        { onConflict: 'conversation_id' }
      );
      if (error) throw error;
      await logEvent({ institutionId: settings.institution_id, conversationId: conversation.id, leadId: conversation.lead_id, event: 'session_started' });
    }

    runInBackground(() => processConversation(conversation.id, { expectedPendingAt: pendingAt, waitSeconds: settings.debounce_seconds }));
    return { queued: true, owns: true, reason: 'queued' };
  } catch (e) {
    console.warn('[ai-assistant] gelen mesaj:', errorMessage(e));
    return { queued: false, owns: false, reason: 'error' };
  }
}

/** Temsilci sohbete elle yazdı → bot bu sohbette susar. */
export async function markAgentReplied(conversationId, actorId = null) {
  try {
    const session = await getSession(conversationId);
    if (!session || session.state === 'handover') return;
    await patchSession(conversationId, {
      state: 'handover',
      handover_at: new Date().toISOString(),
      handover_reason: 'agent_reply',
      handover_by: actorId,
      pending_at: null
    });
    await logEvent({ institutionId: session.institution_id, conversationId, leadId: session.lead_id, event: 'handover', detail: { reason: 'agent_reply' } });
  } catch (e) {
    console.warn('[ai-assistant] temsilci devri:', errorMessage(e));
  }
}

/* ------------------------------------------------------------------ */
/* İşleme                                                              */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STALE_PROCESSING_MS = 3 * 60 * 1000;

/** İşlem hakkını alır: yalnız en son mesajın sahibi ve kilitsizse. */
async function claimSession(conversationId, expectedPendingAt) {
  const staleIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  let q = supabaseAdmin
    .from(SESSION_TABLE)
    .update({ processing_at: new Date().toISOString(), pending_at: null, updated_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .or(`processing_at.is.null,processing_at.lt.${staleIso}`);
  q = expectedPendingAt ? q.eq('pending_at', expectedPendingAt) : q.not('pending_at', 'is', null);
  const { data, error } = await q.select('*').maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadMessages(conversationId, limit = 40) {
  const { data, error } = await supabaseAdmin
    .from('crm_messages')
    .select('id, sender_type, body, message_type, created_at, payload')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).filter((m) => !m?.payload?.deleted_at).reverse();
}

async function loadKnowledge(inst) {
  const [{ data: pages }, { data: tones }] = await Promise.all([
    supabaseAdmin.from(KB_TABLE).select('url, title, content').eq('institution_id', inst).eq('status', 'ok').order('url'),
    supabaseAdmin.from(TONE_TABLE).select('excerpt').eq('institution_id', inst).order('created_at', { ascending: false }).limit(6)
  ]);
  return { kbPages: pages || [], toneExcerpts: (tones || []).map((t) => t.excerpt) };
}

async function loadLead(leadId) {
  if (!leadId) return null;
  const { data } = await supabaseAdmin.from('registration_leads').select('*').eq('id', leadId).maybeSingle();
  return data || null;
}

/** Kanala göre düz metin gönderir. */
async function sendText(conversation, text) {
  const inbox = await import('./crm-inbox.js');
  const channel = String(conversation.channel || '').toLowerCase();
  if (channel === 'whatsapp') {
    await inbox.sendCrmWhatsAppText({ phone: conversation.contact_identifier, text, institutionId: conversation.institution_id });
  } else if (channel === 'instagram') {
    await inbox.sendCrmInstagramDm({ igScopedId: conversation.contact_identifier, text: text.slice(0, 1000), allowHumanAgentTag: false });
  } else {
    throw new Error(`unsupported_channel:${channel}`);
  }
  await inbox.upsertCrmMessage({
    channel: conversation.channel,
    contactIdentifier: conversation.contact_identifier,
    body: text,
    direction: 'outbound',
    senderType: 'bot',
    institutionId: conversation.institution_id,
    leadId: conversation.lead_id || null
  });
}

/** Instagram 1000 karakter sınırı: uzun yanıtı paragraf sınırından böler. */
export function splitForChannel(text, channel) {
  const limit = String(channel) === 'instagram' ? 950 : 3500;
  const out = [];
  let rest = String(text || '').trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('. ', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Konuşmayı işler: Claude yanıtını üretir, gönderir, kaydeder.
 * @param {string} conversationId
 * @param {{expectedPendingAt?:string, waitSeconds?:number}} opts
 */
export async function processConversation(conversationId, { expectedPendingAt = null, waitSeconds = 0 } = {}) {
  if (waitSeconds > 0) await sleep(waitSeconds * 1000);
  const claimed = await claimSession(conversationId, expectedPendingAt);
  if (!claimed) return { ran: false, reason: 'superseded_or_locked' };

  let session = claimed;
  let ctx = null;
  const release = async (patch = {}) => {
    try {
      session = await patchSession(conversationId, { processing_at: null, ...patch });
    } catch (e) {
      console.warn('[ai-assistant] kilit bırakma:', errorMessage(e));
    }
  };

  try {
    const { data: conversation } = await supabaseAdmin.from('crm_conversations').select('*').eq('id', conversationId).maybeSingle();
    if (!conversation) {
      await release();
      return { ran: false, reason: 'conversation_missing' };
    }
    const settings = await getSettings(conversation.institution_id);
    const inst = settings.institution_id;
    const messages = await loadMessages(conversationId);
    const last = messages[messages.length - 1];
    if (!last || last.sender_type !== 'lead') {
      await release();
      return { ran: false, reason: 'no_pending_customer_message' };
    }
    const decision = decideRun({ settings, conversation, session, now: Date.now(), lastInboundAt: last.created_at });
    if (!decision.run) {
      await release();
      await logEvent({ institutionId: inst, conversationId, leadId: conversation.lead_id, event: 'skipped', detail: { reason: decision.reason } });
      return { ran: false, reason: decision.reason };
    }

    const lead = await loadLead(conversation.lead_id || session.lead_id);
    ctx = {
      conversation,
      settings,
      session,
      lead,
      collected: { ...(session.collected || {}) },
      allowedSlots: [],
      handedOver: false,
      booked: null
    };

    // İlk yanıt: bot olduğunu ve KVKK aydınlatmasını bildir (sabit metin, modele bırakılmaz)
    if (!session.kvkk_notice_sent_at) {
      await sendText(conversation, buildKvkkNotice(settings.kvkk_url));
      session = await patchSession(conversationId, { kvkk_notice_sent_at: new Date().toISOString() });
      ctx.session = session;
    }

    const result = await generateReply({ ctx, messages, execute: (name, input) => executeTool(ctx, name, input) });

    let text = result.text;
    if (!text || result.stopReason === 'refusal') {
      text = HANDOVER_REPLY;
      if (!ctx.handedOver) await doHandover(ctx, result.stopReason === 'refusal' ? 'model_refusal' : 'empty_reply');
    }
    for (const part of splitForChannel(text, conversation.channel)) await sendText(conversation, part);

    await release({
      bot_reply_count: Number(session.bot_reply_count || 0) + 1,
      last_processed_at: new Date().toISOString(),
      collected: ctx.collected,
      lead_id: conversation.lead_id || session.lead_id || null
    });
    await logEvent({
      institutionId: inst,
      conversationId,
      leadId: conversation.lead_id,
      event: 'replied',
      detail: { stop_reason: result.stopReason, tools: result.toolCalls.map((t) => t.name), model: settings.model },
      usage: result.usage
    });

    if (ctx.booked || ctx.handedOver) {
      await writeSummary(ctx).catch((e) => console.warn('[ai-assistant] özet:', errorMessage(e)));
    }

    // İşlem sürerken yeni mesaj geldiyse hemen bir tur daha
    if (session?.pending_at && session.state !== 'handover') {
      return processConversation(conversationId, {});
    }
    return { ran: true, reason: 'replied' };
  } catch (e) {
    await release();
    await logEvent({ institutionId: session?.institution_id, conversationId, leadId: session?.lead_id, event: 'error', detail: { error: errorMessage(e) } });
    console.warn('[ai-assistant] işleme:', errorMessage(e));
    // Müşteri cevapsız kalmasın: kibar devir mesajı + ekibe bildirim (bir kez)
    if (ctx && !ctx.handedOver) {
      try {
        await sendText(ctx.conversation, HANDOVER_REPLY);
        await doHandover(ctx, 'ai_error');
      } catch (e2) {
        console.warn('[ai-assistant] hata sonrası devir:', errorMessage(e2));
      }
    }
    return { ran: false, reason: 'error', error: errorMessage(e) };
  }
}

/** Claude'a giden istek (test sohbeti de bunu kullanır). */
export async function generateReply({ ctx, messages, execute, create = claudeCreate }) {
  const { settings, conversation, session, lead } = ctx;
  const { kbPages, toneExcerpts } = await loadKnowledge(settings.institution_id);
  const system = buildStaticSystemPrompt({
    kbPages,
    toneGuide: settings.tone_guide,
    toneExcerpts,
    extraInstructions: settings.extra_instructions
  });
  const history = historyToMessages(messages);
  if (!history.length) return { text: '', stopReason: 'empty_history', usage: {}, toolCalls: [] };
  const contactPhone = String(conversation.channel) === 'whatsapp' ? displayTrPhone(conversation.contact_identifier) : '';
  const dynamic = buildDynamicContext({
    channel: conversation.channel,
    contactName: conversation.contact_name || lead?.full_name || '',
    contactPhone,
    collected: ctx.collected,
    appointmentLabel: session?.appointment_at ? slotLabel(session.appointment_at) : '',
    botReplyCount: Number(session?.bot_reply_count || 0),
    maxBotReplies: Number(settings.max_bot_replies || 15)
  });
  return runAssistantLoop({
    create,
    executeTool: execute,
    params: {
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 8000,
      output_config: { effort: settings.effort || 'medium' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      tools: ASSISTANT_TOOLS,
      messages: [...history, { role: 'system', content: dynamic }]
    }
  });
}

/* ------------------------------------------------------------------ */
/* Araçlar                                                             */
/* ------------------------------------------------------------------ */

async function loadSlotInputs(settings) {
  const inst = settings.institution_id;
  const from = new Date().toISOString();
  const to = new Date(Date.now() + (Number(settings.days_ahead || 3) + 2) * 86400000).toISOString();
  const [{ data: shifts }, { data: tasks }] = await Promise.all([
    supabaseAdmin
      .from('crm_agent_shifts')
      .select('user_id, day_of_week, start_time, end_time, is_active')
      .or(`institution_id.eq.${inst},institution_id.is.null`)
      .eq('is_active', true),
    supabaseAdmin
      .from('registration_tasks')
      .select('assigned_to, due_at, status')
      .eq('status', 'pending')
      .eq('task_type', 'call_parent')
      .gte('due_at', from)
      .lte('due_at', to)
  ]);
  return { shifts: shifts || [], busyTasks: tasks || [] };
}

export async function freeSlotsFor(settings, now = Date.now()) {
  const { shifts, busyTasks } = await loadSlotInputs(settings);
  return {
    busyTasks,
    slots: computeFreeSlots({
      shifts,
      busyTasks,
      consultantIds: settings.consultant_user_ids,
      now,
      slotMinutes: settings.slot_minutes,
      daysAhead: settings.days_ahead,
      minLeadMinutes: settings.min_lead_minutes
    })
  };
}

async function executeTool(ctx, name, input) {
  if (name === 'save_lead_info') {
    ctx.collected = mergeCollected(ctx.collected, input);
    await updateLeadFields(ctx, ctx.collected);
    await patchSession(ctx.conversation.id, { collected: ctx.collected });
    return 'Kaydedildi.';
  }
  if (name === 'get_available_slots') {
    const { slots } = await freeSlotsFor(ctx.settings);
    ctx.allowedSlots = slots;
    if (!slots.length) {
      return 'Önümüzdeki günlerde boş saat bulunamadı. Müşteriye danışmanın en kısa sürede arayacağını söyle ve book_callback çağırma; bilgileri save_lead_info ile kaydet ve handover_to_human çağır.';
    }
    return JSON.stringify(slots.map((s) => ({ start_iso: s.start_iso, label: s.label })));
  }
  if (name === 'book_callback') {
    if (ctx.session?.appointment_task_id) return `Bu kişi için randevu zaten var: ${slotLabel(ctx.session.appointment_at)}. Yeni randevu açılmadı.`;
    if (!ctx.allowedSlots.length) ctx.allowedSlots = (await freeSlotsFor(ctx.settings)).slots;
    const v = validateBooking(input, { allowedStarts: ctx.allowedSlots.map((s) => s.start_iso) });
    if (!v.ok) return `Randevu oluşturulmadı: ${v.errors.join('; ')}. Eksik bilgiyi müşteriden iste ya da get_available_slots ile güncel saatleri al.`;
    return bookCallback(ctx, v.value);
  }
  if (name === 'handover_to_human') {
    await doHandover(ctx, String(input?.reason || 'model_handover').slice(0, 300));
    return 'Konuşma insan temsilciye devredildi. Müşteriye danışmanımızın en kısa sürede dönüş yapacağını kısa ve nazik bir dille söyle; yeni soru sorma.';
  }
  throw new Error(`Bilinmeyen araç: ${name}`);
}

/** Lead kartına toplanan bilgileri yazar (boş alanların üzerine; mevcut veriyi ezmez). */
async function updateLeadFields(ctx, collected) {
  const lead = ctx.lead;
  if (!lead?.id) return;
  const patch = { updated_at: new Date().toISOString() };
  if (collected.student_name && (!lead.full_name || lead.full_name === ctx.conversation.contact_name)) {
    patch.full_name = collected.student_name;
  }
  if (collected.parent_name && !lead.parent_full_name) patch.parent_full_name = collected.parent_name;
  const code = gradeProgramCode(collected.grade, collected.target);
  if (code && (!lead.grade_program || lead.grade_program === 'unspecified')) patch.grade_program = code;
  if (collected.interest && !lead.interested_package) patch.interested_package = collected.interest.slice(0, 200);
  const { error } = await supabaseAdmin.from('registration_leads').update(patch).eq('id', lead.id);
  if (error) console.warn('[ai-assistant] lead alanları:', error.message);
  else Object.assign(lead, patch);

  // Telefon ayrı: (kurum, normalized_phone) tekil — çakışırsa sessizce atlanır
  const phone = collected.parent_phone || collected.phone;
  if (phone && !lead.phone) {
    const { error: pErr } = await supabaseAdmin
      .from('registration_leads')
      .update({ phone, normalized_phone: `0${phone.slice(2)}` })
      .eq('id', lead.id);
    if (!pErr) lead.phone = phone;
  }
}

async function bookCallback(ctx, b) {
  const { conversation, settings } = ctx;
  const slot = ctx.allowedSlots.find((s) => s.start_iso === b.start_iso);
  const { busyTasks } = await loadSlotInputs(settings);
  const freeNow = (slot?.user_ids || []).filter(
    (uid) =>
      !busyTasks.some((t) => String(t.assigned_to) === uid && Date.parse(t.due_at) >= Date.parse(b.start_iso) && Date.parse(t.due_at) < Date.parse(b.start_iso) + settings.slot_minutes * 60000)
  );
  const consultant = pickConsultant(freeNow, busyTasks);
  if (!consultant) return 'Bu saat az önce doldu. get_available_slots ile güncel saatleri alıp yeni seçenek sun.';

  ctx.collected = mergeCollected(ctx.collected, b);
  const leadId = ctx.lead?.id || null;
  const label = slotLabel(b.start_iso);
  const lines = [
    `Kaynak: AI satış asistanı (${conversation.channel})`,
    `Öğrenci: ${b.student_name} · ${b.grade} · Hedef: ${b.target}`,
    `Aranacak: ${displayTrPhone(b.parent_phone || b.phone)}${b.parent_name ? ` (veli ${b.parent_name})` : ''}`,
    b.is_minor ? 'Öğrenci 18 yaşından küçük — görüşme veliyle yapılmalı.' : '',
    b.parent_phone && b.phone && b.parent_phone !== b.phone ? `Öğrenci tel: ${displayTrPhone(b.phone)}` : '',
    b.notes ? `Not: ${b.notes}` : '',
    `Sohbet: /crm/inbox?c=${conversation.id}`
  ].filter(Boolean);

  const { data: task, error } = await supabaseAdmin
    .from('registration_tasks')
    .insert({
      lead_id: leadId,
      institution_id: settings.institution_id,
      assigned_to: consultant,
      title: `AI randevu – ${b.student_name} (${b.grade}, ${b.target}) – ${label}`.slice(0, 300),
      description: lines.join('\n'),
      task_type: 'call_parent',
      priority: 'high',
      status: 'pending',
      due_at: b.start_iso,
      created_by: BOT_AUTHOR_ID,
      deduplication_key: `ai-callback:${leadId || conversation.id}:${b.start_iso}`,
      auto_generated: true
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) return `Bu saat için randevu zaten oluşturulmuş: ${label}.`;
    throw error;
  }

  await updateLeadFields(ctx, ctx.collected);
  if (leadId) await advanceLeadStage(ctx, { consultant, startIso: b.start_iso, label });

  ctx.session = await patchSession(conversation.id, {
    appointment_task_id: task?.id || null,
    appointment_at: b.start_iso,
    appointment_user_id: consultant,
    collected: ctx.collected,
    state: 'completed'
  });
  ctx.booked = { label, consultant, taskId: task?.id };

  await notifyUsers([consultant], {
    title: `📞 AI randevu: ${label}`,
    body: `${b.student_name} (${b.grade}, ${b.target}) — ${displayTrPhone(b.parent_phone || b.phone)}`,
    conversation,
    institutionId: settings.institution_id
  });
  await logEvent({ institutionId: settings.institution_id, conversationId: conversation.id, leadId, event: 'appointment_booked', detail: { start_iso: b.start_iso, consultant, task_id: task?.id } });
  return `Randevu oluşturuldu: ${label}. Danışman bu saatte ${displayTrPhone(b.parent_phone || b.phone)} numarasını arayacak. Müşteriye saati ve numarayı teyit et, teşekkür et.`;
}

async function advanceLeadStage(ctx, { consultant, startIso, label }) {
  const lead = ctx.lead;
  const patch = {
    next_action_at: startIso,
    next_action_type: 'call_parent',
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (!lead.assigned_user_id) patch.assigned_user_id = consultant;
  const early = !lead.stage || ['new_lead', 'no_response'].includes(String(lead.stage));
  if (early) patch.stage = 'first_contact_pending';
  const { error } = await supabaseAdmin.from('registration_leads').update(patch).eq('id', lead.id);
  if (error) {
    console.warn('[ai-assistant] lead aşaması:', error.message);
    return;
  }
  if (early) {
    await supabaseAdmin
      .from('registration_stage_history')
      .insert({
        lead_id: lead.id,
        old_primary_status: lead.primary_status || null,
        new_primary_status: lead.primary_status || null,
        old_stage: lead.stage || null,
        new_stage: 'first_contact_pending',
        reason: `AI asistan danışman araması planladı (${label})`,
        changed_by: BOT_AUTHOR_ID
      })
      .then(({ error: e }) => e && console.warn('[ai-assistant] aşama geçmişi:', e.message));
  }
  Object.assign(lead, patch);
}

async function doHandover(ctx, reason) {
  const { conversation, settings } = ctx;
  ctx.handedOver = true;
  ctx.session = await patchSession(conversation.id, {
    state: 'handover',
    handover_at: new Date().toISOString(),
    handover_reason: reason,
    handover_by: BOT_AUTHOR_ID,
    collected: ctx.collected
  });
  const recipients = conversation.assigned_user_id ? [String(conversation.assigned_user_id)] : await adminUserIds(conversation.institution_id);
  await notifyUsers(recipients, {
    title: '🙋 AI asistan konuşmayı devretti',
    body: `${conversation.contact_name || 'Aday'}: ${reason}`,
    conversation,
    institutionId: settings.institution_id
  });
  await logEvent({ institutionId: settings.institution_id, conversationId: conversation.id, leadId: conversation.lead_id, event: 'handover', detail: { reason, by: 'ai' } });
}

async function adminUserIds(institutionId) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, role, roles, is_active')
    .or(`institution_id.eq.${instKey(institutionId)},role.eq.super_admin`)
    .limit(200);
  return (data || [])
    .filter((u) => u.is_active !== false)
    .filter((u) => (Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role]).some((r) => ['admin', 'super_admin'].includes(String(r))))
    .map((u) => String(u.id));
}

async function notifyUsers(userIds, { title, body, conversation, institutionId }) {
  try {
    const { createCrmNotification, conversationLink } = await import('./crm-notify.js');
    for (const uid of [...new Set(userIds || [])]) {
      await createCrmNotification({
        userId: uid,
        title,
        body,
        link: conversationLink(conversation.id),
        priority: 'high',
        institutionId,
        tag: `ai-${conversation.id}`
      });
    }
  } catch (e) {
    console.warn('[ai-assistant] bildirim:', errorMessage(e));
  }
}

/* ------------------------------------------------------------------ */
/* Özet → lead kartı                                                   */
/* ------------------------------------------------------------------ */

export async function summarizeMessages(messages, settings, create = claudeCreate) {
  const transcript = messages
    .filter((m) => String(m.body || '').trim())
    .slice(-60)
    .map((m) => `${m.sender_type === 'lead' ? 'Müşteri' : m.sender_type === 'bot' ? 'Asistan' : 'Temsilci'}: ${String(m.body).slice(0, 800)}`)
    .join('\n');
  const res = await create({
    model: settings.model || DEFAULT_MODEL,
    max_tokens: 3000,
    output_config: { effort: 'low' },
    system:
      'CRM için satış görüşmesi özeti yaz. Türkçe, en fazla 6 kısa madde: kim (öğrenci/veli, sınıf, hedef), ne istedi, itirazlar/soru işaretleri, verilen bilgiler, sonuç (randevu saati veya devir nedeni), danışmana öneri. Uydurma bilgi ekleme.',
    messages: [{ role: 'user', content: transcript || '(boş)' }]
  });
  return (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

async function writeSummary(ctx) {
  const { conversation, settings } = ctx;
  const messages = await loadMessages(conversation.id, 80);
  const summary = await summarizeMessages(messages, settings);
  if (!summary) return;
  await patchSession(conversation.id, { summary });
  await supabaseAdmin
    .from('crm_conversation_notes')
    .insert({ conversation_id: conversation.id, author_user_id: BOT_AUTHOR_ID, body: `🤖 AI asistan özeti\n${summary}` })
    .then(({ error }) => error && console.warn('[ai-assistant] not:', error.message));
  const leadId = ctx.lead?.id || conversation.lead_id;
  if (leadId) {
    await supabaseAdmin
      .from('registration_interactions')
      .insert({
        lead_id: leadId,
        institution_id: settings.institution_id,
        interaction_type: conversation.channel === 'whatsapp' ? 'whatsapp' : 'other',
        interaction_at: new Date().toISOString(),
        title: ctx.booked ? `AI asistan: randevu ${ctx.booked.label}` : 'AI asistan: konuşma devredildi',
        description: summary,
        result: ctx.booked ? 'appointment_booked' : 'handover',
        next_action_type: ctx.booked ? 'call_parent' : null,
        next_action_at: ctx.session?.appointment_at || null,
        created_by: BOT_AUTHOR_ID
      })
      .then(({ error }) => error && console.warn('[ai-assistant] etkileşim:', error.message));
  }
}

/* ------------------------------------------------------------------ */
/* Panel işlemleri                                                     */
/* ------------------------------------------------------------------ */

/** "İnsana devret" butonu */
export async function handoverConversation(conversationId, { actorId = null, reason = 'manual' } = {}) {
  const { data: conversation } = await supabaseAdmin.from('crm_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conversation) return { ok: false, error: 'conversation_not_found' };
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from(SESSION_TABLE).upsert(
    {
      conversation_id: conversationId,
      institution_id: instKey(conversation.institution_id),
      lead_id: conversation.lead_id || null,
      channel: String(conversation.channel || ''),
      state: 'handover',
      handover_at: now,
      handover_reason: reason,
      handover_by: actorId,
      pending_at: null,
      updated_at: now
    },
    { onConflict: 'conversation_id' }
  );
  if (error) throw error;
  await logEvent({ institutionId: instKey(conversation.institution_id), conversationId, leadId: conversation.lead_id, event: 'handover', detail: { reason, by: actorId } });
  return { ok: true };
}

/** Botu bu sohbette yeniden başlat */
export async function resumeConversation(conversationId, { actorId = null } = {}) {
  const session = await getSession(conversationId);
  if (!session) return { ok: false, error: 'session_not_found' };
  await patchSession(conversationId, { state: 'active', handover_at: null, handover_reason: null, handover_by: null, bot_reply_count: 0 });
  await logEvent({ institutionId: session.institution_id, conversationId, leadId: session.lead_id, event: 'resumed', detail: { by: actorId } });
  return { ok: true };
}

/** Siteyi çekip bilgi tabanını yeniler. */
export async function refreshKnowledgeBase(institutionId, { fetchImpl = fetch } = {}) {
  const settings = await getSettings(institutionId);
  const inst = settings.institution_id;
  const urls = sanitizeSiteUrls(settings.site_urls?.length ? settings.site_urls : DEFAULT_SITE_URLS);
  const results = [];
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const row = { institution_id: inst, url, fetched_at: new Date().toISOString() };
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        const res = await fetchImpl(url, { signal: ctl.signal, headers: { 'User-Agent': 'OnlineVIP-CRM-KnowledgeBot/1.0', Accept: 'text/html' } });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { title, text } = htmlToText(await res.text());
        if (text.length < 80) throw new Error('sayfa boş görünüyor');
        const { createHash } = await import('node:crypto');
        Object.assign(row, { title, content: text.slice(0, 40000), content_hash: createHash('sha256').update(text).digest('hex'), status: 'ok', error: null });
      } catch (e) {
        Object.assign(row, { status: 'error', error: errorMessage(e).slice(0, 300) });
      }
      results.push(row);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const row of results) {
    // Hata alan sayfanın eski içeriği korunur
    const patch = row.status === 'ok' ? row : { institution_id: row.institution_id, url: row.url, status: 'error', error: row.error, fetched_at: row.fetched_at };
    const { error } = await supabaseAdmin.from(KB_TABLE).upsert(patch, { onConflict: 'institution_id,url' });
    if (error) throw error;
  }
  // Listeden çıkarılan adresler bilgi tabanından da silinir
  const { data: existing } = await supabaseAdmin.from(KB_TABLE).select('id, url').eq('institution_id', inst);
  const stale = (existing || []).filter((r) => !urls.includes(r.url)).map((r) => r.id);
  if (stale.length) await supabaseAdmin.from(KB_TABLE).delete().in('id', stale);
  const ok = results.filter((r) => r.status === 'ok').length;
  await logEvent({ institutionId: inst, event: 'kb_refreshed', detail: { ok, failed: results.length - ok } });
  return { ok, failed: results.length - ok, pages: results.map((r) => ({ url: r.url, title: r.title || null, status: r.status, error: r.error || null, chars: r.content?.length || 0 })) };
}

/** Sohbet dışa aktarımı yükler (anonimleştirilmiş örnek olarak saklanır). */
export async function addToneSource(institutionId, { fileName, content, businessAuthor = '' }, actorId = null) {
  const inst = instKey(institutionId);
  const parsed = parseChatExport(fileName, content);
  if (parsed.messages.length < 4) throw new Error('Dosyada yeterli mesaj bulunamadı (WhatsApp .txt veya Instagram message_1.json yükleyin)');
  const { excerpt, businessAuthor: biz, messageCount } = buildToneExcerpt(parsed.messages, { businessAuthor });
  const { data, error } = await supabaseAdmin
    .from(TONE_TABLE)
    .insert({ institution_id: inst, file_name: String(fileName || '').slice(0, 200), source_kind: parsed.kind, message_count: messageCount, excerpt, created_by: actorId })
    .select('id, file_name, source_kind, message_count, created_at')
    .maybeSingle();
  if (error) throw error;
  await logEvent({ institutionId: inst, event: 'tone_uploaded', detail: { file: fileName, messages: messageCount, business_author_detected: Boolean(biz) } });
  return { ...data, business_author: biz };
}

/** Yüklenen örneklerden ton rehberi üretir (Claude). Yönetici panelde düzenleyebilir. */
export async function rebuildToneGuide(institutionId, actorId = null, create = claudeCreate) {
  const settings = await getSettings(institutionId);
  const { data: tones, error } = await supabaseAdmin
    .from(TONE_TABLE)
    .select('excerpt')
    .eq('institution_id', settings.institution_id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!tones?.length) throw new Error('Önce geçmiş sohbet yükleyin');
  const res = await create({
    model: settings.model || DEFAULT_MODEL,
    max_tokens: 6000,
    output_config: { effort: 'medium' },
    system:
      'Bir eğitim kurumunun satış temsilcilerinin geçmiş WhatsApp/Instagram yazışmalarından, yeni satış asistanı için kısa bir üslup rehberi çıkar. Türkçe yaz, en fazla 25 madde, şu başlıklarla: Hitap ve ton, Mesaj uzunluğu ve biçim, Sık sorulara yaklaşım, İtiraz karşılama kalıpları (itiraz → cevap örneği), Randevuya/kapanışa geçiş cümleleri, Kaçınılacaklar. Fiyat, tarih, kişi adı gibi somut bilgileri rehbere YAZMA; yalnız üslup ve kalıpları yaz.',
    messages: [{ role: 'user', content: tones.map((t) => t.excerpt).join('\n\n---\n\n').slice(0, 120000) }]
  });
  const guide = (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!guide) throw new Error('Ton rehberi üretilemedi');
  await saveSettings(settings.institution_id, { tone_guide: guide }, actorId);
  return guide;
}

/**
 * Panel "Deneme sohbeti": hiçbir şey gönderilmez / kaydedilmez,
 * randevu ve devir araçları taklit edilir.
 */
export async function testChat(institutionId, turns = []) {
  const settings = await getSettings(institutionId);
  const messages = (Array.isArray(turns) ? turns : [])
    .slice(-30)
    .map((t) => ({ sender_type: t.role === 'user' ? 'lead' : 'bot', body: String(t.text || '').slice(0, 2000) }));
  const ctx = {
    conversation: { id: 'test', channel: 'whatsapp', contact_identifier: '', contact_name: 'Deneme' },
    settings,
    session: { bot_reply_count: 0 },
    lead: null,
    collected: {},
    allowedSlots: []
  };
  const notes = [];
  const execute = async (name, input) => {
    notes.push({ tool: name, input });
    if (name === 'save_lead_info') {
      ctx.collected = mergeCollected(ctx.collected, input);
      return 'Kaydedildi.';
    }
    if (name === 'get_available_slots') {
      const { slots } = await freeSlotsFor(settings);
      ctx.allowedSlots = slots;
      return slots.length ? JSON.stringify(slots.map((s) => ({ start_iso: s.start_iso, label: s.label }))) : 'Boş saat yok.';
    }
    if (name === 'book_callback') {
      const v = validateBooking(input, { allowedStarts: ctx.allowedSlots.map((s) => s.start_iso) });
      return v.ok ? `(DENEME) Randevu oluşturuldu: ${slotLabel(v.value.start_iso)}. Müşteriye teyit et.` : `Randevu oluşturulmadı: ${v.errors.join('; ')}`;
    }
    if (name === 'handover_to_human') return '(DENEME) Konuşma devredildi. Müşteriye danışmanın döneceğini söyle.';
    throw new Error(`Bilinmeyen araç: ${name}`);
  };
  const result = await generateReply({ ctx, messages, execute });
  return {
    reply: result.text || HANDOVER_REPLY,
    stop_reason: result.stopReason,
    tools: notes,
    usage: result.usage,
    kvkk_notice: messages.filter((m) => m.sender_type === 'bot').length === 0 ? buildKvkkNotice(settings.kvkk_url) : null
  };
}

/** Cron: webhook'un arka plan işi yarıda kaldıysa bekleyen konuşmaları işler. */
export async function processPendingSessions({ limit = 10 } = {}) {
  const cutoff = new Date(Date.now() - 45 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from(SESSION_TABLE)
    .select('conversation_id, pending_at')
    .not('pending_at', 'is', null)
    .lt('pending_at', cutoff)
    .order('pending_at', { ascending: true })
    .limit(limit);
  if (error) {
    if (tableMissing(error)) return { processed: 0, table_missing: true };
    throw error;
  }
  const out = [];
  for (const row of data || []) {
    out.push({ conversation_id: row.conversation_id, ...(await processConversation(row.conversation_id, { expectedPendingAt: row.pending_at })) });
  }
  return { processed: out.length, results: out };
}

export { normalizeTrPhone };
