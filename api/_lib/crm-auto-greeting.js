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
  DEFAULT_CONSULTANT_TEXT,
  DEFAULT_GRADE_TEXT,
  DEFAULT_GREETING_TEXT,
  GRADE_LEVELS,
  GRADE_OPTIONS,
  PREFER_MESSAGE_OPTION,
  detectGrade,
  gradeOptionsForLevel,
  isChannelEnabled,
  isWithinRunWindow,
  levelOfGrade,
  nextFlowAction,
  numberedOptions
} from './crm-auto-greeting-core.js';

export { GRADE_OPTIONS, GRADE_LEVELS, DEFAULT_CALL_SLOTS };

/** Yanıt gelmezse kaç dakika sonra danışman mesajı gider. */
export const DEFAULT_FOLLOWUP_MINUTES = 3;

function followupMinutes(settings) {
  const n = Number(settings?.followup_minutes);
  return Number.isFinite(n) && n >= 1 && n <= 180 ? n : DEFAULT_FOLLOWUP_MINUTES;
}

function followupDueAt(settings, from = new Date()) {
  return new Date(from.getTime() + followupMinutes(settings) * 60_000).toISOString();
}

export function consultantText(settings) {
  return String(settings?.consultant_text || DEFAULT_CONSULTANT_TEXT);
}

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
    'call_slots',
    'teacher_flow_active',
    'teacher_channel_whatsapp',
    'teacher_channel_instagram',
    'teacher_channel_facebook',
    'teacher_message',
    'teacher_application_url',
    'grade_text',
    'use_interactive',
    'ask_call_slot',
    'followup_minutes',
    'consultant_text',
    'skip_grade_when_known'
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

/**
 * Kanala göre mesaj gönderir.
 *
 * options verilirse önce resmî API'nin seçim bileşeni denenir
 * (WhatsApp interactive / Instagram quick reply). Kanal veya limit izin
 * vermezse numaralı metne düşer — mesaj her hâlükârda gider.
 */
async function sendByChannel({ conversation, text, institutionId, options = null, listButtonLabel }) {
  const channel = String(conversation?.channel || '').toLowerCase();
  const contact = String(conversation?.contact_identifier || '').trim();
  if (!contact || !text) return { ok: false, error: 'missing_target' };

  const opts = Array.isArray(options) && options.length ? options : null;
  const fallbackBody = opts ? text + '\n\n' + numberedOptions(opts) : text;

  if (channel === 'whatsapp') {
    const inbox = await import('./crm-inbox.js');
    if (opts) {
      const { buildWhatsAppInteractive } = await import('./crm-interactive-message.js');
      const interactive = buildWhatsAppInteractive({ text, options: opts, listButtonLabel });
      if (interactive) {
        try {
          await inbox.sendCrmWhatsAppInteractive({ phone: contact, interactive, institutionId });
          return { ok: true, interactive: true, body: text };
        } catch (e) {
          console.warn('[auto-greeting] interactive gonderilemedi, metne dusuldu:', errorMessage(e));
        }
      }
    }
    await inbox.sendCrmWhatsAppText({ phone: contact, text: fallbackBody, institutionId });
    return { ok: true, interactive: false, body: fallbackBody };
  }

  if (channel === 'instagram' || channel === 'facebook') {
    const inbox = await import('./crm-inbox.js');
    if (opts) {
      const { buildInstagramQuickReplies } = await import('./crm-interactive-message.js');
      const payload = buildInstagramQuickReplies({ text, options: opts });
      if (payload) {
        try {
          await inbox.sendCrmInstagramQuickReplies({
            igScopedId: contact,
            text: payload.text,
            quickReplies: payload.quick_replies
          });
          return { ok: true, interactive: true, body: text };
        } catch (e) {
          console.warn('[auto-greeting] quick reply gonderilemedi, metne dusuldu:', errorMessage(e));
        }
      }
    }
    await inbox.sendCrmInstagramDm({ igScopedId: contact, text: fallbackBody });
    return { ok: true, interactive: false, body: fallbackBody };
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
  return String(settings?.greeting_text || DEFAULT_GREETING_TEXT);
}

function buildGradeQuestion(settings) {
  return String(settings?.grade_text || DEFAULT_GRADE_TEXT);
}

function buildCallTimeMessage(settings, programLabel) {
  const raw = String(settings?.call_time_text || DEFAULT_CALL_TIME_TEXT);
  return raw.replace(/\{program\}/g, programLabel || '');
}

function callSlotOptions(settings) {
  const slots = Array.isArray(settings?.call_slots) && settings.call_slots.length
    ? settings.call_slots
    : DEFAULT_CALL_SLOTS;
  return [...slots, PREFER_MESSAGE_OPTION].map((label) => ({ key: String(label), label: String(label) }));
}

/**
 * Sınıf form / reklam kaydından zaten biliniyorsa bir daha sorulmaz.
 * Kaynak: registration_leads.grade_program (web formu, Meta lead formu).
 */
async function resolveKnownGrade(conversation, settings) {
  if (settings?.skip_grade_when_known === false) return null;
  const leadId = conversation?.lead_id ? String(conversation.lead_id) : '';
  if (!leadId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('registration_leads')
      .select('grade_program')
      .eq('id', leadId)
      .maybeSingle();
    if (error) return null;
    const raw = String(data?.grade_program || '').trim();
    if (!raw) return null;
    const hit = detectGrade(raw);
    return hit ? { key: hit.key, label: hit.label } : null;
  } catch (e) {
    console.warn('[auto-greeting] lead sinifi okunamadi:', errorMessage(e));
    return null;
  }
}

/** Saat aralığı sorulmadığı akışta: "en kısa sürede aransın" görevi. */
async function createQuickCallTask({ leadId, institutionId, assignedTo, contactName, gradeLabelText }) {
  if (!leadId) return null;
  const today = getIstanbulDateString();
  const title = `${gradeLabelText || 'Aday'} - ${contactName || 'Yeni lead'} - en kisa surede aranacak`;
  try {
    const { error } = await supabaseAdmin.from('registration_tasks').insert({
      lead_id: leadId,
      institution_id: institutionId || null,
      assigned_to: assignedTo || null,
      title: title.slice(0, 300),
      description: 'Otomatik karsilama: musteri sinifini secti, danisman aramasi bekleniyor.',
      task_type: 'call_parent',
      priority: 'high',
      status: 'pending',
      due_at: new Date().toISOString(),
      deduplication_key: `auto-greeting-quick:${leadId}:${today}`,
      auto_generated: true
    });
    if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
    return title;
  } catch (e) {
    console.warn('[auto-greeting] hizli gorev:', errorMessage(e));
    return null;
  }
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

/** Öğretmen otomasyonu bu kanalda açık mı? */
function isTeacherChannelEnabled(settings, channel) {
  const ch = String(channel || '').toLowerCase();
  if (ch === 'whatsapp') return settings?.teacher_channel_whatsapp !== false;
  if (ch === 'instagram') return settings?.teacher_channel_instagram !== false;
  if (ch === 'facebook') return settings?.teacher_channel_facebook !== false;
  return false;
}

/**
 * Öğretmen Başvuru Otomasyonu.
 * Öğrenci/veli akışından bağımsız açılır. Açık ve niyet NET ise başvuru linkini
 * bir kez gönderir; aynı sohbette tekrar göndermez.
 *
 * @returns {Promise<{handled: boolean, reason?: string}>} handled=true ise
 *          öğrenci/veli akışı çalıştırılmaz.
 */
async function runTeacherFlow({ conversation, body, settings, institutionId, session }) {
  const { detectTeacherApplication, buildTeacherApplicationMessage, teacherFlowReady, TEACHER_APPLICATION_TAGS } =
    await import('./crm-teacher-application.js');

  const base = {
    institutionId,
    conversationId: conversation.id,
    leadId: conversation.lead_id || null
  };

  // Bu sohbet zaten öğretmen akışındaysa: link tekrar gönderilmez
  if (session?.flow_kind === 'teacher') {
    await logEvent({ ...base, event: 'teacher_repeat_blocked' });
    return { handled: true, reason: 'already_sent' };
  }

  const hit = detectTeacherApplication(body);
  if (!hit.match) return { handled: false, reason: 'not_teacher' };

  // Niyet net değilse hiçbir otomasyon çalışmasın (yanlış cevap gitmesin)
  if (hit.confidence !== 'high') {
    await logEvent({ ...base, event: 'teacher_intent_unclear', detail: hit });
    return { handled: true, reason: 'intent_unclear' };
  }

  if (settings?.teacher_flow_active !== true) {
    await logEvent({ ...base, event: 'teacher_intent_detected', detail: { ...hit, sent: false } });
    return { handled: true, reason: 'teacher_flow_disabled' };
  }
  if (!isTeacherChannelEnabled(settings, conversation.channel)) {
    return { handled: true, reason: 'teacher_channel_disabled' };
  }
  if (!teacherFlowReady(settings)) {
    await logEvent({ ...base, event: 'error', detail: { step: 'teacher', error: 'application_url_missing' } });
    return { handled: true, reason: 'application_url_missing' };
  }

  await logEvent({ ...base, event: 'teacher_intent_detected', detail: hit });

  const text = buildTeacherApplicationMessage({
    template: settings.teacher_message,
    applicationUrl: settings.teacher_application_url
  });
  const sent = await sendByChannel({ conversation, text, institutionId });
  if (!sent.ok) {
    await logEvent({ ...base, event: 'error', detail: { step: 'teacher_send', error: sent.error } });
    return { handled: true, reason: sent.error };
  }
  await recordOutgoing({ conversation, text, institutionId });

  await upsertSession({
    conversation_id: conversation.id,
    institution_id: institutionId || null,
    lead_id: conversation.lead_id || null,
    channel: String(conversation.channel || ''),
    flow_kind: 'teacher',
    step: 'completed',
    teacher_status: 'link_sent',
    teacher_link_sent_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  });

  const channelTag = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' }[
    String(conversation.channel || '').toLowerCase()
  ];
  await addTags(conversation, [...TEACHER_APPLICATION_TAGS, channelTag]);
  await logEvent({ ...base, event: 'teacher_message_sent' });
  await logEvent({ ...base, event: 'teacher_tag_added' });
  return { handled: true, reason: 'teacher_link_sent' };
}

/**
 * Temsilci öğretmen başvuru şablonunu elle gönderdi.
 * Otomatik akış kapalı olsa da çalışır; oturum işaretlenir.
 */
export async function markTeacherTemplateSentManually({ conversation, institutionId }) {
  try {
    await upsertSession({
      conversation_id: conversation.id,
      institution_id: institutionId || conversation.institution_id || null,
      lead_id: conversation.lead_id || null,
      channel: String(conversation.channel || ''),
      flow_kind: 'teacher',
      step: 'completed',
      teacher_status: 'link_sent',
      teacher_link_sent_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });
    const { TEACHER_APPLICATION_TAGS } = await import('./crm-teacher-application.js');
    await addTags(conversation, TEACHER_APPLICATION_TAGS);
    await logEvent({
      institutionId: institutionId || conversation.institution_id,
      conversationId: conversation.id,
      leadId: conversation.lead_id || null,
      event: 'teacher_template_manual'
    });
    return { ok: true };
  } catch (e) {
    console.warn('[auto-greeting] manuel öğretmen şablonu:', errorMessage(e));
    return { ok: false, error: errorMessage(e) };
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
    if (!settings) return { ran: false, reason: 'module_disabled' };
    if (settings.is_active !== true && settings.teacher_flow_active !== true) {
      return { ran: false, reason: 'module_disabled' };
    }
    if (settings.is_active === true && !isChannelEnabled(settings, conversation.channel)) {
      // Öğrenci akışı bu kanalda kapalı olsa da öğretmen akışı çalışabilir
      if (settings.teacher_flow_active !== true) return { ran: false, reason: 'channel_disabled' };
    }

    const nowHhmm = istanbulHhmm();
    const session = await getSession(conversation.id);

    if (session?.human_takeover_at) return { ran: false, reason: 'human_takeover' };

    /**
     * ÖNCELİK: mesaj açıkça öğretmen / iş başvurusuysa öğrenci-veli satış akışı
     * ÇALIŞTIRILMAZ. Öğretmene "öğrencimiz kaçıncı sınıf?" sorusu gitmez.
     */
    const teacher = await runTeacherFlow({ conversation, body, settings, institutionId, session });
    if (teacher.handled) return { ran: teacher.reason === 'teacher_link_sent', reason: teacher.reason };

    if (settings.is_active !== true) return { ran: false, reason: 'student_flow_disabled' };

    // Çalışma penceresi yalnız AKIŞI BAŞLATIRKEN bakılır; başlamış akış
    // mesai içinde de tamamlanabilsin (müşteri yarım bırakmasın).
    if (!session && !isWithinRunWindow(settings, nowHhmm)) {
      return { ran: false, reason: 'outside_window' };
    }

    const knownGrade = session ? null : await resolveKnownGrade(conversation, settings);
    const askCallSlot = settings.ask_call_slot === true;
    const decision = nextFlowAction({
      session,
      body,
      slots: Array.isArray(settings.call_slots) ? settings.call_slots : DEFAULT_CALL_SLOTS,
      knownGrade,
      askCallSlot
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
      const options = GRADE_LEVELS.map((l) => ({ key: l.key, label: l.label }));
      const sent = await sendByChannel({
        conversation,
        text,
        institutionId,
        options: settings.use_interactive === false ? null : options,
        listButtonLabel: 'Kademe seç'
      });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'greet', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text: sent.body || text, institutionId });
      await upsertSession({
        ...base,
        step: 'level_asked',
        followup_due_at: followupDueAt(settings),
        followup_sent_at: null
      });
      await addTags(conversation, ['Yeni Lead', 'Otomatik karşılama']);
      await logEvent({ ...base, event: 'greeting_sent', detail: { interactive: Boolean(sent.interactive) } });
      return { ran: true, action: 'greet' };
    }

    if (decision.action === 'ask_grade') {
      const level = decision.level;
      const text = buildGradeQuestion(settings);
      const options = gradeOptionsForLevel(level.key).map((o) => ({ key: o.key, label: o.label }));
      const sent = await sendByChannel({
        conversation,
        text,
        institutionId,
        options: settings.use_interactive === false ? null : options,
        listButtonLabel: 'Sınıf seç'
      });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'ask_grade', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text: sent.body || text, institutionId });
      await upsertSession({
        ...base,
        step: 'grade_asked',
        grade_level: level.key,
        followup_due_at: followupDueAt(settings),
        followup_sent_at: null
      });
      await logEvent({ ...base, event: 'level_selected', detail: level });
      return { ran: true, action: 'ask_grade' };
    }

    if (decision.action === 'ask_slot') {
      const label = decision.grade.label;
      const text = buildCallTimeMessage(settings, label);
      const sent = await sendByChannel({
        conversation,
        text,
        institutionId,
        options: settings.use_interactive === false ? null : callSlotOptions(settings),
        listButtonLabel: 'Saat seç'
      });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'ask_slot', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text: sent.body || text, institutionId });
      await upsertSession({
        ...base,
        step: 'slot_asked',
        grade_program: label,
        grade_level: levelOfGrade(decision.grade.key) || null,
        grade_source: decision.reason || null,
        followup_due_at: followupDueAt(settings),
        followup_sent_at: null
      });
      await updateLead({
        leadId: conversation.lead_id,
        gradeLabelText: label,
        channel: conversation.channel
      });
      await addTags(conversation, ['Yeni Lead', label]);
      await logEvent({ ...base, event: 'grade_detected', detail: decision.grade });
      return { ran: true, action: 'ask_slot' };
    }

    // Yeni akış: sınıf seçildi → "danışmanımız iletişime geçecek" ve akış biter
    if (decision.action === 'complete' && decision.grade) {
      const label = decision.grade.label;
      const text = consultantText(settings);
      const sent = await sendByChannel({ conversation, text, institutionId });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'handoff', error: sent.error } });
        return { ran: false, reason: sent.error };
      }
      await recordOutgoing({ conversation, text, institutionId });
      await upsertSession({
        ...base,
        step: 'completed',
        grade_program: label,
        grade_level: levelOfGrade(decision.grade.key) || null,
        grade_source: decision.reason || null,
        followup_due_at: null,
        completed_at: new Date().toISOString()
      });
      await updateLead({ leadId: conversation.lead_id, gradeLabelText: label, channel: conversation.channel });
      const taskTitle = await createQuickCallTask({
        leadId: conversation.lead_id,
        institutionId,
        assignedTo: conversation.assigned_user_id || null,
        contactName: conversation.contact_name || conversation.contact_username,
        gradeLabelText: label
      });
      await addTags(conversation, ['Yeni Lead', label, 'Arama Talebi']);
      await logEvent({ ...base, event: 'grade_detected', detail: decision.grade });
      await logEvent({ ...base, event: 'task_created', detail: { taskTitle, quick: true } });
      await logEvent({ ...base, event: 'flow_completed', detail: { grade: label, askCallSlot: false } });
      return { ran: true, action: 'complete' };
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
        followup_due_at: null,
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

/**
 * Yanıt gelmeyen sohbetlere danışman mesajı (varsayılan 3 dk).
 *
 * Müşteri seçenekleri görüp hiçbir şey seçmezse konuşma ortada kalmasın diye
 * aynı kapanış mesajı gönderilir ve satış ekibine görev açılır. Cron her
 * dakika çağırır; oturum başına yalnız BİR kez gönderilir.
 *
 * Atlanan durumlar: temsilci devraldıysa, akış zaten bittiyse, kurum modülü
 * kapattıysa. Hiçbiri hata üretmez — sessizce geçilir.
 */
export async function runAutoGreetingFollowups({ limit = 40, now = new Date() } = {}) {
  const out = { checked: 0, sent: 0, skipped: 0, errors: 0 };
  let rows = [];
  try {
    const { data, error } = await supabaseAdmin
      .from(SESSION_TABLE)
      .select('*')
      .lte('followup_due_at', now.toISOString())
      .is('followup_sent_at', null)
      .is('human_takeover_at', null)
      .not('followup_due_at', 'is', null)
      .limit(Math.min(200, Math.max(1, Number(limit) || 40)));
    if (error) {
      if (tableMissing(error)) return { ...out, reason: 'table_missing' };
      throw error;
    }
    rows = data || [];
  } catch (e) {
    console.warn('[auto-greeting] takip listesi:', errorMessage(e));
    return { ...out, reason: 'query_failed', error: errorMessage(e) };
  }

  for (const session of rows) {
    out.checked += 1;
    const step = String(session.step || '');
    if (step === 'completed' || step === 'stopped' || session.flow_kind === 'teacher') {
      await clearFollowup(session.conversation_id);
      out.skipped += 1;
      continue;
    }
    try {
      const settings = await getAutoGreetingSettings(session.institution_id);
      if (!settings || settings.is_active !== true) {
        await clearFollowup(session.conversation_id);
        out.skipped += 1;
        continue;
      }
      const { data: conversation } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', session.conversation_id)
        .maybeSingle();
      if (!conversation) {
        await clearFollowup(session.conversation_id);
        out.skipped += 1;
        continue;
      }

      const base = {
        institutionId: session.institution_id,
        conversationId: session.conversation_id,
        leadId: session.lead_id || null
      };
      const text = consultantText(settings);
      const sent = await sendByChannel({
        conversation,
        text,
        institutionId: session.institution_id
      });
      if (!sent.ok) {
        await logEvent({ ...base, event: 'error', detail: { step: 'followup', error: sent.error } });
        out.errors += 1;
        continue;
      }
      await recordOutgoing({ conversation, text, institutionId: session.institution_id });
      await supabaseAdmin
        .from(SESSION_TABLE)
        .update({
          step: 'completed',
          followup_due_at: null,
          followup_sent_at: new Date().toISOString(),
          stopped_reason: 'no_selection_followup',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('conversation_id', session.conversation_id);

      await createQuickCallTask({
        leadId: session.lead_id,
        institutionId: session.institution_id,
        assignedTo: conversation.assigned_user_id || null,
        contactName: conversation.contact_name || conversation.contact_username,
        gradeLabelText: session.grade_program || 'Sınıf belirtilmedi'
      });
      await addTags(conversation, ['Yeni Lead', 'Seçim yapılmadı']);
      await logEvent({ ...base, event: 'followup_sent', detail: { step } });
      out.sent += 1;
    } catch (e) {
      console.warn('[auto-greeting] takip:', errorMessage(e));
      out.errors += 1;
    }
  }
  return out;
}

async function clearFollowup(conversationId) {
  try {
    await supabaseAdmin
      .from(SESSION_TABLE)
      .update({ followup_due_at: null, updated_at: new Date().toISOString() })
      .eq('conversation_id', conversationId);
  } catch {
    /* takip alanı temizlenemezse bir sonraki turda yeniden denenir */
  }
}
