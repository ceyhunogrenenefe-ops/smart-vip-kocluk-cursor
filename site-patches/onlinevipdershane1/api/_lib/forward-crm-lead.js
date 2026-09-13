/**
 * Site API (iletisim / assessment) → koçluk paneli CRM.
 * Mevcut e-posta / Kommo akışını silmez; yanına ekleyin.
 *
 *   import { forwardCrmLead } from './_lib/forward-crm-lead.js';
 *   waitUntil(forwardCrmLead({ ...body, form_kind: 'iletisim' }));
 */
const CRM = process.env.CRM_SITE_LEADS_URL || 'https://www.dersonlinevipkocluk.com/api/site-leads';
const SECRET = String(process.env.SITE_LEAD_WEBHOOK_SECRET || '').trim();

export async function forwardCrmLead(payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (SECRET) headers['x-site-lead-secret'] = SECRET;
  const res = await fetch(CRM, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`crm_forward_${res.status}:${text.slice(0, 180)}`);
  }
  return res.json().catch(() => ({ ok: true }));
}
