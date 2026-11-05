/**
 * CRM Web Sitesinden Gelen Siparişler
 * GET/POST /api/crm-website-orders?op=list|export|backfill|setup
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  backfillCrmWebsiteOrders,
  CRM_WEBSITE_ORDERS_SETUP_SQL,
  CRM_WEBSITE_ORDERS_TABLE,
  ensureCrmWebsiteOrdersSchema,
  isSchemaMissing,
  listCrmWebsiteOrders,
} from '../api/_lib/crm-website-orders.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function crmMayAccess(actor, roleSet) {
  return actorIsAdminLike(actor, roleSet) || roleSet.has('crm_agent');
}

export default async function handler(req, res) {
  const body = req.method === 'GET' ? {} : parseBody(req);
  const op = String(req.query?.op || body.op || 'list').trim();

  if (op === 'setup') {
    const auth = authorizeVercelOrCronSecret(req);
    if (!auth.ok) return res.status(401).json({ error: 'unauthorized' });
    try {
      const ensured = await ensureCrmWebsiteOrdersSchema();
      if (!ensured.ok) {
        return res.status(503).json({
          ok: false,
          error: 'schema_missing',
          sql: CRM_WEBSITE_ORDERS_SETUP_SQL,
          hint: "student-coaching-system/sql/2026-11-05-crm-website-orders.sql dosyasını Supabase'de çalıştırın.",
          ...ensured,
        });
      }
      return res.status(200).json({ ok: true, table: CRM_WEBSITE_ORDERS_TABLE, ...ensured });
    } catch (e) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  if (op === 'backfill' && authorizeVercelOrCronSecret(req).ok) {
    try {
      await ensureCrmWebsiteOrdersSchema();
      const result = await backfillCrmWebsiteOrders({
        source: req.query.source || body.source,
        cursor: req.query.cursor || body.cursor,
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      if (isSchemaMissing(e)) {
        return res.status(503).json({
          error: 'schema_missing',
          hint: "Supabase'de 2026-11-05-crm-website-orders.sql çalıştırın veya ?op=setup",
          sql: CRM_WEBSITE_ORDERS_SETUP_SQL,
        });
      }
      console.error('[crm-website-orders backfill]', errorMessage(e));
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const roleSet = await actorRoleSet(actor);
  if (!crmMayAccess(actor, roleSet)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    if (op === 'list' && req.method === 'GET') {
      const result = await listCrmWebsiteOrders({
        q: req.query.q,
        payment_status: req.query.payment_status,
        product_category: req.query.product_category,
        address_status: req.query.address_status,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.status(200).json({ ok: true, ...result });
    }

    if (op === 'export' && req.method === 'GET') {
      const result = await listCrmWebsiteOrders({
        q: req.query.q,
        payment_status: req.query.payment_status,
        product_category: req.query.product_category,
        address_status: req.query.address_status,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: 5000,
        offset: 0,
      });
      return res.status(200).json({ ok: true, rows: result.rows });
    }

    if (op === 'backfill') {
      const adminOnly = actorIsAdminLike(actor, roleSet);
      const cronOk = authorizeVercelOrCronSecret(req).ok;
      if (!adminOnly && !cronOk) {
        return res.status(403).json({ error: 'admin_only' });
      }
      const result = await backfillCrmWebsiteOrders({
        source: req.query.source || body.source,
        cursor: req.query.cursor || body.cursor,
      });
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    if (isSchemaMissing(e)) {
      return res.status(503).json({
        error: 'schema_missing',
        hint: "Supabase'de 2026-11-05-crm-website-orders.sql çalıştırın veya ?op=setup",
        sql: CRM_WEBSITE_ORDERS_SETUP_SQL,
      });
    }
    console.error('[crm-website-orders]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
}
