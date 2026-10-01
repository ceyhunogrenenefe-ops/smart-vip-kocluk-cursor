/**
 * Pipeline kişi kartı: Kayıt Takibi kanal mesajları + CRM Gelen Kutusu mesajları birleşimi.
 */
import { supabaseAdmin } from './supabase-admin.js';

/** Lead telefonunun CRM'de kullanılabilecek yazımları (905…, +905…). */
export function leadPhoneVariants(lead) {
  const out = new Set();
  for (const raw of [lead?.normalized_phone, lead?.phone]) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) continue;
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
    if (d.length === 11 && d.startsWith('0')) d = `90${d.slice(1)}`;
    out.add(d);
    out.add(`+${d}`);
  }
  return [...out];
}

/** Lead'e bağlı (lead_id veya aynı WhatsApp numarası) CRM konuşmalarının son mesajları. */
export async function loadCrmInboxMessagesForLead(lead) {
  const convIds = new Map();
  const { data: byLead } = await supabaseAdmin
    .from('crm_conversations')
    .select('id, channel, contact_name')
    .eq('lead_id', lead.id)
    .limit(20);
  for (const c of byLead || []) convIds.set(c.id, c);
  const phones = leadPhoneVariants(lead);
  if (phones.length) {
    let q = supabaseAdmin
      .from('crm_conversations')
      .select('id, channel, contact_name')
      .eq('channel', 'whatsapp')
      .in('contact_identifier', phones)
      .limit(20);
    if (lead.institution_id) q = q.eq('institution_id', lead.institution_id);
    const { data: byPhone } = await q;
    for (const c of byPhone || []) convIds.set(c.id, c);
  }
  if (!convIds.size) return [];

  const { data, error } = await supabaseAdmin
    .from('crm_messages')
    .select('*')
    .in('conversation_id', [...convIds.keys()])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((m) => {
    const conv = convIds.get(m.conversation_id) || {};
    return {
      id: `crm:${m.id}`,
      channel: conv.channel || 'whatsapp',
      direction: m.sender_type === 'lead' ? 'inbound' : 'outbound',
      body: m.body,
      message_type: m.message_type,
      contact_name: conv.contact_name || null,
      phone: null,
      occurred_at: m.created_at,
      external_message_id: m.message_id || m.external_message_id || null,
      created_at: m.created_at,
      sender_type: m.sender_type || null,
      source: 'crm_inbox'
    };
  });
}

/** İki kaynaktaki mesajları birleştirir, tekrarları atar, eskiden yeniye son 200'ü döner. */
export function mergeLeadChannelMessages(regMsgs, crmMsgs) {
  const seenExt = new Set();
  const seenSig = new Set();
  const sig = (m) => {
    const t = Math.floor(new Date(m.occurred_at || m.created_at || 0).getTime() / 60000);
    return `${m.direction}|${String(m.body || '').trim().slice(0, 120)}|${t}`;
  };
  const out = [];
  for (const m of [...regMsgs, ...crmMsgs]) {
    const ext = m.external_message_id ? String(m.external_message_id) : '';
    if (ext && seenExt.has(ext)) continue;
    const s = sig(m);
    if (seenSig.has(s)) continue;
    if (ext) seenExt.add(ext);
    seenSig.add(s);
    out.push(m);
  }
  out.sort((a, b) => new Date(a.occurred_at || a.created_at || 0) - new Date(b.occurred_at || b.created_at || 0));
  return out.slice(-200);
}
