/**
 * Kayıt Takibi — WhatsApp / Instagram mesaj ingest
 * Telefon (WA) veya Instagram scoped id ile lead eşler; yoksa yeni lead açabilir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { upsertCrmMessage, extractAdSourceData, toMetaWaContactId } from './crm-inbox.js';
import { normalizeTrPhone, phoneLookupVariants } from './registration-tracking-utils.js';

function snippetOf(text, max = 140) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function isoFromWebhookTs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  // Meta: WA saniye; Instagram messaging çoğu zaman milisaniye
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

/** Panelde kullanılan ana kurum (Online Vip Dershane Ders ve Koçluk) */
const PRIMARY_REGISTRATION_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

async function resolveDefaultInstitutionId() {
  const envId = String(
    process.env.REGISTRATION_INBOUND_INSTITUTION_ID ||
      process.env.META_WHATSAPP_DEFAULT_INSTITUTION_ID ||
      process.env.DEFAULT_INSTITUTION_ID ||
      ''
  ).trim();
  if (envId) return envId;

  // Env yoksa: önce bilinen Online VIP kurumunu doğrula (yanlış kuruma lead yazmasın)
  try {
    const { data: primary } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .eq('id', PRIMARY_REGISTRATION_INSTITUTION_ID)
      .maybeSingle();
    if (primary?.id) return primary.id;
  } catch {
    /* fallback */
  }

  try {
    const { data: byName } = await supabaseAdmin
      .from('institutions')
      .select('id, name')
      .ilike('name', '%Online Vip%')
      .limit(5);
    const preferred = (byName || []).find((r) => /dershane/i.test(String(r.name || ''))) || byName?.[0];
    if (preferred?.id) return preferred.id;
  } catch {
    /* fallback */
  }

  // Son çare: herhangi bir kurum (created_at yoksa / sıralama patlarsa)
  const attempts = [
    () => supabaseAdmin.from('institutions').select('id').order('created_at', { ascending: true }).limit(1),
    () => supabaseAdmin.from('institutions').select('id').eq('is_active', true).limit(1),
    () => supabaseAdmin.from('institutions').select('id').limit(1)
  ];
  for (const run of attempts) {
    try {
      const { data, error } = await run();
      if (error) continue;
      const id = data?.[0]?.id || null;
      if (id) return id;
    } catch {
      /* sonraki fallback */
    }
  }
  console.warn(
    '[channel-ingest] institution çözülemedi — Vercel env REGISTRATION_INBOUND_INSTITUTION_ID ayarlayın'
  );
  return null;
}

async function findLeadByPhone(normalizedPhone, institutionId, { includeAlternate = true } = {}) {
  if (!normalizedPhone) return null;
  const variants = phoneLookupVariants(normalizedPhone);
  if (!variants.length) return null;

  const orParts = [];
  for (const v of variants) {
    orParts.push(`normalized_phone.eq.${v}`);
    if (includeAlternate) orParts.push(`normalized_alternate_phone.eq.${v}`);
    orParts.push(`phone.eq.${v}`);
  }

  let q = supabaseAdmin
    .from('registration_leads')
    .select('id, institution_id, full_name, primary_status, stage')
    .is('deleted_at', null)
    .or(orParts.join(','))
    .order('updated_at', { ascending: false })
    .limit(8);
  if (institutionId) q = q.eq('institution_id', institutionId);

  const { data, error } = await q;
  if (error) {
    // Eski şemada alternate kolonu yoksa sorgunun tamamı düşmesin
    if (includeAlternate && /normalized_alternate_phone|column/i.test(error.message || '')) {
      return findLeadByPhone(normalizedPhone, institutionId, { includeAlternate: false });
    }
    throw error;
  }
  if (!data?.length) {
    if (institutionId) return findLeadByPhone(normalizedPhone, null, { includeAlternate });
    return null;
  }
  const tracking = data.find((l) => l.primary_status === 'tracking');
  return tracking || data[0];
}

async function findLeadByInstagramId(igId, institutionId) {
  if (!igId) return null;
  let q = supabaseAdmin
    .from('registration_leads')
    .select('id, institution_id, full_name, primary_status, stage')
    .is('deleted_at', null)
    .eq('instagram_scoped_id', String(igId))
    .order('updated_at', { ascending: false })
    .limit(3);
  if (institutionId) q = q.eq('institution_id', institutionId);

  const { data, error } = await q;
  if (error) {
    if (/instagram_scoped_id|column/i.test(error.message || '')) return null;
    throw error;
  }
  if (!data?.length && institutionId) return findLeadByInstagramId(igId, null);
  return data?.[0] || null;
}

async function createLeadFromInbound({
  institutionId,
  channel,
  phone,
  normalizedPhone,
  contactName,
  instagramScopedId,
  firstMessage
}) {
  const auto =
    String(process.env.REGISTRATION_INBOUND_AUTO_LEAD || '1').trim() !== '0' &&
    String(process.env.REGISTRATION_INBOUND_AUTO_LEAD || '1').toLowerCase() !== 'false';
  if (!auto || !institutionId) return null;

  const name = String(contactName || '').trim() || (channel === 'instagram' ? 'Instagram Lead' : 'WhatsApp Lead');
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Lead';
  const lastName = parts.slice(1).join(' ') || (channel === 'instagram' ? 'IG' : 'WA');
  const now = new Date().toISOString();

  const row = {
    institution_id: institutionId,
    first_name: firstName.slice(0, 80),
    last_name: lastName.slice(0, 80),
    parent_full_name: name.slice(0, 160),
    phone: phone || null,
    normalized_phone: normalizedPhone || null,
    grade_program: 'lgs',
    primary_status: 'tracking',
    stage: 'new_lead',
    temperature: 'warm',
    source: channel === 'instagram' ? 'instagram_inbound' : 'whatsapp_inbound',
    notes: firstMessage ? `İlk mesaj: ${snippetOf(firstMessage, 200)}` : null,
    first_contact_at: now,
    last_contact_at: now
  };
  if (instagramScopedId) row.instagram_scoped_id = String(instagramScopedId);

  const { data, error } = await supabaseAdmin.from('registration_leads').insert(row).select('id, institution_id').maybeSingle();
  if (error) {
    console.warn('[channel-ingest] auto lead create failed:', error.message || error);
    return null;
  }
  return data;
}

/**
 * @param {object} msg
 * @param {'whatsapp'|'instagram'} msg.channel
 * @param {'inbound'|'outbound'} [msg.direction]
 * @param {string} [msg.phone]
 * @param {string} [msg.externalContactId]
 * @param {string} [msg.contactName]
 * @param {string} [msg.body]
 * @param {string} [msg.messageType]
 * @param {string} [msg.externalMessageId]
 * @param {string|number} [msg.timestamp]
 * @param {object} [msg.payload]
 * @param {string} [msg.institutionId]
 */
export async function ingestRegistrationChannelMessage(msg) {
  const channel = msg.channel === 'instagram' ? 'instagram' : 'whatsapp';
  const direction = msg.direction === 'outbound' ? 'outbound' : 'inbound';
  const body = msg.body != null ? String(msg.body) : null;
  const externalMessageId = msg.externalMessageId ? String(msg.externalMessageId) : null;
  const phoneRaw = msg.phone != null ? String(msg.phone) : null;
  const normalizedPhone = normalizeTrPhone(phoneRaw);
  const externalContactId = msg.externalContactId ? String(msg.externalContactId) : null;
  const contactName = msg.contactName ? String(msg.contactName).trim() : null;
  const occurredAt = isoFromWebhookTs(msg.timestamp);
  let institutionId = msg.institutionId || (await resolveDefaultInstitutionId());

  if (externalMessageId) {
    try {
      const { data: dup } = await supabaseAdmin
        .from('registration_channel_messages')
        .select('id, lead_id')
        .eq('channel', channel)
        .eq('external_message_id', externalMessageId)
        .maybeSingle();
      if (dup?.id) return { skipped: true, reason: 'duplicate', lead_id: dup.lead_id || null };
    } catch (e) {
      if (/registration_channel_messages|does not exist|schema cache/i.test(e?.message || '')) {
        console.warn('[channel-ingest] table missing — run SQL migration');
        return { skipped: true, reason: 'table_missing' };
      }
    }
  }

  let lead = null;
  try {
    lead =
      channel === 'whatsapp'
        ? await findLeadByPhone(normalizedPhone, institutionId)
        : await findLeadByInstagramId(externalContactId, institutionId);

    if (!lead && direction === 'inbound') {
      if (!institutionId) {
        console.warn('[channel-ingest] auto-lead atlandı — institution_id yok');
      } else {
        lead = await createLeadFromInbound({
          institutionId,
          channel,
          phone: phoneRaw,
          normalizedPhone,
          contactName,
          instagramScopedId: channel === 'instagram' ? externalContactId : null,
          firstMessage: body
        });
      }
    }
  } catch (e) {
    // Lead eşleme/oluşturma patlasa bile mesaj satırını yazmayı dene (teşhis için)
    console.warn('[channel-ingest] lead resolve/create:', e instanceof Error ? e.message : e);
  }

  if (lead?.institution_id) institutionId = lead.institution_id;

  const insertRow = {
    institution_id: institutionId,
    lead_id: lead?.id || null,
    channel,
    direction,
    phone: phoneRaw,
    normalized_phone: normalizedPhone,
    external_contact_id: externalContactId,
    contact_name: contactName,
    body,
    message_type: String(msg.messageType || 'text').slice(0, 40),
    external_message_id: externalMessageId,
    payload: msg.payload || null,
    occurred_at: occurredAt
  };

  let saved = null;
  try {
    const { data, error } = await supabaseAdmin.from('registration_channel_messages').insert(insertRow).select('*').maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) return { skipped: true, reason: 'duplicate' };
      if (/registration_channel_messages|schema cache|does not exist/i.test(error.message || '')) {
        console.warn('[channel-ingest] table missing — run SQL migration');
        return { skipped: true, reason: 'table_missing' };
      }
      throw error;
    }
    saved = data;
  } catch (e) {
    if (/registration_channel_messages|does not exist/i.test(e?.message || '')) {
      return { skipped: true, reason: 'table_missing' };
    }
    throw e;
  }

  if (lead?.id && direction === 'inbound') {
    const snip = snippetOf(body);
    const leadPatch = {
      last_contact_at: occurredAt,
      last_inbound_channel: channel,
      last_inbound_snippet: snip,
      last_inbound_at: occurredAt,
      updated_at: new Date().toISOString()
    };
    if (channel === 'instagram' && externalContactId) {
      leadPatch.instagram_scoped_id = externalContactId;
    }
    try {
      await supabaseAdmin.from('registration_leads').update(leadPatch).eq('id', lead.id);
    } catch (e) {
      if (/last_inbound_|instagram_scoped/i.test(e?.message || '')) {
        await supabaseAdmin
          .from('registration_leads')
          .update({ last_contact_at: occurredAt, updated_at: new Date().toISOString() })
          .eq('id', lead.id);
      } else {
        console.warn('[channel-ingest] lead patch:', e instanceof Error ? e.message : e);
      }
    }

    try {
      await supabaseAdmin.from('registration_interactions').insert({
        lead_id: lead.id,
        institution_id: institutionId,
        interaction_type: channel === 'instagram' ? 'other' : 'whatsapp',
        interaction_at: occurredAt,
        title: channel === 'instagram' ? 'Gelen Instagram' : 'Gelen WhatsApp',
        description: body,
        result: null,
        created_by: null
      });
    } catch (e) {
      console.warn('[channel-ingest] interaction insert:', e instanceof Error ? e.message : e);
    }
  }


  // Mirror into CRM unified inbox (best-effort; table may be absent)
  try {
    const contactIdentifier =
      channel === 'instagram'
        ? externalContactId || null
        : toMetaWaContactId(phoneRaw || normalizedPhone || externalContactId) ||
          phoneRaw ||
          normalizedPhone ||
          externalContactId ||
          null;
    if (contactIdentifier && direction === 'inbound') {
      await upsertCrmMessage({
        channel,
        contactIdentifier,
        contactName,
        body,
        messageType: String(msg.messageType || 'text'),
        messageId: externalMessageId,
        timestamp: msg.timestamp,
        direction: 'inbound',
        senderType: 'lead',
        institutionId,
        leadId: lead?.id || null,
        adSourceData: extractAdSourceData({
          channel,
          message: channel === 'whatsapp' ? msg.payload : null,
          messagingEvent: channel === 'instagram' ? msg.payload : null
        }),
        payload: msg.payload || null
      });
    } else if (contactIdentifier && direction === 'outbound') {
      await upsertCrmMessage({
        channel,
        contactIdentifier,
        contactName,
        body,
        messageType: String(msg.messageType || 'text'),
        messageId: externalMessageId,
        timestamp: msg.timestamp,
        direction: 'outbound',
        senderType: 'agent',
        senderId: msg.senderId || null,
        institutionId,
        leadId: lead?.id || null,
        payload: msg.payload || null
      });
    }
  } catch (e) {
    console.warn('[channel-ingest] crm mirror:', e instanceof Error ? e.message : e);
  }

  return { ok: true, lead_id: lead?.id || null, message: saved };
}

/** WhatsApp Cloud API value.messages → ingest */
export async function ingestWhatsAppCloudMessages(value) {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  if (!messages.length) return { processed: 0 };

  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  const nameByWaId = new Map();
  for (const c of contacts) {
    const waId = String(c?.wa_id || '').trim();
    const name = c?.profile?.name ? String(c.profile.name).trim() : '';
    if (waId && name) nameByWaId.set(waId, name);
  }

  let processed = 0;
  for (const m of messages) {
    const from = String(m?.from || '').trim();
    if (!from) continue;
    const type = String(m?.type || 'text').toLowerCase();
    let textBody = null;
    if (type === 'text') textBody = m?.text?.body != null ? String(m.text.body) : null;
    else if (type === 'button') textBody = m?.button?.text != null ? String(m.button.text) : `[button]`;
    else if (type === 'interactive') {
      textBody =
        m?.interactive?.button_reply?.title ||
        m?.interactive?.list_reply?.title ||
        `[interactive:${type}]`;
    } else if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) {
      const caption = m?.[type]?.caption;
      textBody = caption ? String(caption) : `[${type}]`;
    } else {
      textBody = `[${type}]`;
    }

    await ingestRegistrationChannelMessage({
      channel: 'whatsapp',
      direction: 'inbound',
      phone: from,
      externalContactId: from,
      contactName: nameByWaId.get(from) || null,
      body: textBody,
      messageType: type,
      externalMessageId: m?.id ? String(m.id) : null,
      timestamp: m?.timestamp,
      payload: m
    });
    processed += 1;
  }
  return { processed };
}

/** Instagram Messaging API entry.messaging[] → ingest */
export async function ingestInstagramMessagingEvents(messagingEvents) {
  const events = Array.isArray(messagingEvents) ? messagingEvents : [];
  let processed = 0;
  for (const ev of events) {
    if (ev?.message?.is_echo) continue;
    const mid = ev?.message?.mid ? String(ev.message.mid) : null;
    const text = ev?.message?.text != null ? String(ev.message.text) : null;
    const senderId = ev?.sender?.id ? String(ev.sender.id) : null;
    if (!senderId) continue;
    if (!text && !ev?.message?.attachments) continue;
    const body = text || '[medya / ek]';

    await ingestRegistrationChannelMessage({
      channel: 'instagram',
      direction: 'inbound',
      externalContactId: senderId,
      contactName: null,
      body,
      messageType: text ? 'text' : 'attachment',
      externalMessageId: mid,
      timestamp: ev?.timestamp,
      payload: ev
    });
    processed += 1;
  }
  return { processed };
}

/** Yönetici teşhis: tablo / kurum / son mesajlar */
export async function diagnoseRegistrationInbound(institutionId) {
  const resolvedInstitutionId = institutionId || (await resolveDefaultInstitutionId());
  const autoLead =
    String(process.env.REGISTRATION_INBOUND_AUTO_LEAD || '1').trim() !== '0' &&
    String(process.env.REGISTRATION_INBOUND_AUTO_LEAD || '1').toLowerCase() !== 'false';

  let tableOk = false;
  let tableError = null;
  let recentMessages = [];
  let messageCount = null;
  try {
    const { count, error: countErr } = await supabaseAdmin
      .from('registration_channel_messages')
      .select('id', { count: 'exact', head: true });
    if (countErr) throw countErr;
    tableOk = true;
    messageCount = count;

    let q = supabaseAdmin
      .from('registration_channel_messages')
      .select('id, lead_id, channel, direction, phone, body, occurred_at, created_at, institution_id')
      .order('created_at', { ascending: false })
      .limit(10);
    if (resolvedInstitutionId) q = q.eq('institution_id', resolvedInstitutionId);
    const { data, error } = await q;
    if (error) throw error;
    recentMessages = data || [];
  } catch (e) {
    tableError = e instanceof Error ? e.message : String(e);
    if (/registration_channel_messages|does not exist|schema cache/i.test(tableError || '')) {
      tableOk = false;
    }
  }

  let recentInboundLeads = [];
  try {
    let q = supabaseAdmin
      .from('registration_leads')
      .select('id, full_name, stage, source, phone, last_inbound_snippet, last_inbound_at, institution_id')
      .is('deleted_at', null)
      .or('source.ilike.%whatsapp%,source.ilike.%instagram%,last_inbound_at.not.is.null')
      .order('created_at', { ascending: false })
      .limit(10);
    if (resolvedInstitutionId) q = q.eq('institution_id', resolvedInstitutionId);
    const { data } = await q;
    recentInboundLeads = data || [];
  } catch {
    /* kolon yoksa sessiz */
  }

  return {
    table_ok: tableOk,
    table_error: tableError,
    message_count: messageCount,
    institution_id: resolvedInstitutionId,
    institution_from_env: Boolean(
      String(
        process.env.REGISTRATION_INBOUND_INSTITUTION_ID ||
          process.env.META_WHATSAPP_DEFAULT_INSTITUTION_ID ||
          process.env.DEFAULT_INSTITUTION_ID ||
          ''
      ).trim()
    ),
    auto_lead_enabled: autoLead,
    recent_messages: recentMessages,
    recent_inbound_leads: recentInboundLeads,
    hints: [
      !tableOk
        ? 'SQL migration eksik veya tablo adı uyuşmuyor — 2026-09-05-registration-channel-messages.sql çalıştırın.'
        : null,
      !resolvedInstitutionId
        ? 'Kurum bulunamadı — Vercel REGISTRATION_INBOUND_INSTITUTION_ID = paneldeki institutions.id'
        : null,
      tableOk && messageCount === 0
        ? 'Tablo boş: Meta webhook messages aboneliği / Cloud API numarasına yazılan mesaj gelmiyor olabilir (QR gateway ayrı kanal).'
        : null,
      tableOk && (recentMessages || []).some((m) => !m.lead_id)
        ? 'lead_id boş mesajlar var — auto-lead / institution_id kontrol edin.'
        : null
    ].filter(Boolean)
  };
}

/** Yönetici: Meta beklemeden sahte inbound (Gelen leadler smoke test) */
export async function simulateRegistrationInbound({
  institutionId,
  phone,
  body,
  contactName,
  channel = 'whatsapp'
} = {}) {
  const inst = institutionId || (await resolveDefaultInstitutionId());
  if (!inst) {
    return { ok: false, error: 'institution_missing', hint: 'REGISTRATION_INBOUND_INSTITUTION_ID veya institutions satırı gerekli' };
  }
  const digits = String(phone || '905559990042').replace(/\D/g, '') || '905559990042';
  const text = body || `Panel test inbound ${new Date().toISOString()}`;
  const externalMessageId = `wamid.PANEL_TEST_${Date.now()}`;
  const result = await ingestRegistrationChannelMessage({
    channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
    direction: 'inbound',
    phone: digits,
    externalContactId: channel === 'instagram' ? `ig_test_${Date.now()}` : digits,
    contactName: contactName || 'Panel Test Lead',
    body: text,
    messageType: 'text',
    externalMessageId,
    timestamp: Math.floor(Date.now() / 1000),
    institutionId: inst,
    payload: { source: 'panel_simulate' }
  });
  return { ok: true, institution_id: inst, result };
}
