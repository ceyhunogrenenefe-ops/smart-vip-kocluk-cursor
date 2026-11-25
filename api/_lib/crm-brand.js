/**
 * CRM bildirimlerinde görünen kurum adı.
 * Platform kurumu (Online VIP) eski adıyla kalır; diğer kurumlar kendi adını görür.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';

export const PLATFORM_CRM_NAME = 'Online VIP CRM';

const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

export function crmNameFor(institutionName) {
  const n = String(institutionName || '').trim();
  return n ? `${n} CRM` : 'CRM';
}

export async function crmSenderName(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id || id === PLATFORM_PRIMARY_INSTITUTION_ID) return PLATFORM_CRM_NAME;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = 'CRM';
  try {
    const { data } = await supabaseAdmin.from('institutions').select('name').eq('id', id).maybeSingle();
    value = crmNameFor(data?.name);
  } catch {
    /* ad okunamazsa nötr ad */
  }
  cache.set(id, { at: Date.now(), value });
  return value;
}
