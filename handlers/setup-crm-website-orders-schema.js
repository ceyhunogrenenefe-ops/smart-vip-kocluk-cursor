/**
 * GET|POST /api/setup-crm-website-orders-schema — tablo tanısı (CRON_SECRET)
 */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import {
  CRM_WEBSITE_ORDERS_SETUP_SQL,
  CRM_WEBSITE_ORDERS_TABLE,
  ensureCrmWebsiteOrdersSchema,
  isSchemaMissing,
} from '../api/_lib/crm-website-orders.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized', reason: auth.reason });

  try {
    const ensured = await ensureCrmWebsiteOrdersSchema();
    if (!ensured.ok) {
      return res.status(503).json({
        ok: false,
        table: CRM_WEBSITE_ORDERS_TABLE,
        sql: CRM_WEBSITE_ORDERS_SETUP_SQL,
        ...ensured,
      });
    }
    return res.status(200).json({ ok: true, table: CRM_WEBSITE_ORDERS_TABLE, ...ensured });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'failed' });
  }
}
