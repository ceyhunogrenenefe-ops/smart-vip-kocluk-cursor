/**
 * GET|POST /api/setup-crm-website-orders-schema — tablo tanısı (CRON_SECRET)
 */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import {
  CRM_WEBSITE_ORDERS_SETUP_SQL,
  CRM_WEBSITE_ORDERS_TABLE,
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
    const { error } = await supabaseAdmin.from(CRM_WEBSITE_ORDERS_TABLE).select('id').limit(1);
    if (error && isSchemaMissing(error)) {
      return res.status(503).json({
        ok: false,
        table: CRM_WEBSITE_ORDERS_TABLE,
        sql: CRM_WEBSITE_ORDERS_SETUP_SQL,
      });
    }
    if (error) throw error;
    return res.status(200).json({ ok: true, table: CRM_WEBSITE_ORDERS_TABLE });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'failed' });
  }
}
