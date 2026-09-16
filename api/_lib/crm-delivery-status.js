/**
 * CRM giden mesaj teslimat durumu (Meta WhatsApp statuses webhook).
 * Sıra: accepted → sent → delivered → read. failed her durumda son söz.
 */
import { supabaseAdmin } from './supabase-admin.js';

const RANK = { send_failed: 0, accepted: 1, gateway_sent: 1, sent: 2, delivered: 3, read: 4 };

/** Gelen durum mevcut durumu ilerletiyorsa yeni durumu, aksi halde null döner. */
export function nextDeliveryStatus(current, incoming) {
  const inc = String(incoming || '').trim().toLowerCase();
  const cur = String(current || '').trim().toLowerCase();
  if (!inc) return null;
  if (inc === 'failed') return cur === 'failed' ? null : 'failed';
  if (!(inc in RANK)) return null;
  // failed sonrası geç gelen "sent" geri almasın; delivered/read ise gerçekten ulaştı demektir
  if (cur === 'failed') return inc === 'delivered' || inc === 'read' ? inc : null;
  const curRank = cur in RANK ? RANK[cur] : -1;
  return RANK[inc] > curRank ? inc : null;
}

export async function applyCrmDeliveryStatus(wamid, status, errText = null) {
  const id = String(wamid || '').trim();
  if (!id) return { updated: 0 };
  let updated = 0;
  const now = new Date().toISOString();

  try {
    const { data } = await supabaseAdmin
      .from('registration_channel_messages')
      .select('id, delivery_status')
      .eq('external_message_id', id)
      .limit(5);
    for (const row of data || []) {
      const next = nextDeliveryStatus(row.delivery_status, status);
      if (!next) continue;
      const patch = { delivery_status: next, delivery_updated_at: now };
      if (next === 'failed') patch.delivery_error = errText ? String(errText).slice(0, 500) : 'Meta teslimat hatası';
      await supabaseAdmin.from('registration_channel_messages').update(patch).eq('id', row.id);
      updated += 1;
    }
  } catch (e) {
    console.warn('[crm-delivery-status] registration:', e instanceof Error ? e.message : e);
  }

  try {
    const { data } = await supabaseAdmin
      .from('crm_messages')
      .select('id, delivery_status')
      .eq('message_id', id)
      .limit(5);
    for (const row of data || []) {
      const next = nextDeliveryStatus(row.delivery_status, status);
      if (!next) continue;
      await supabaseAdmin.from('crm_messages').update({ delivery_status: next }).eq('id', row.id);
      updated += 1;
    }
  } catch (e) {
    console.warn('[crm-delivery-status] inbox:', e instanceof Error ? e.message : e);
  }

  return { updated };
}

/**
 * Kampanya mesaj satırlarından özet.
 * accepted/gateway_sent/sent = beklemede (ulaştı bilgisi henüz yok).
 */
export function summarizeCampaignMessages(rows = [], plannedCount = 0) {
  const s = { planned: Number(plannedCount) || 0, attempted: 0, accepted: 0, delivered: 0, read: 0, failed: 0, pending: 0 };
  for (const r of rows) {
    s.attempted += 1;
    const sendOk = r?.payload?.send?.ok !== false && r?.delivery_status !== 'send_failed';
    const st = String(r?.delivery_status || '').toLowerCase();
    if (!sendOk) {
      s.failed += 1;
      continue;
    }
    s.accepted += 1;
    if (st === 'read') {
      s.delivered += 1;
      s.read += 1;
    } else if (st === 'delivered') s.delivered += 1;
    else if (st === 'failed') s.failed += 1;
    else s.pending += 1;
  }
  if (s.planned < s.attempted) s.planned = s.attempted;
  return s;
}
