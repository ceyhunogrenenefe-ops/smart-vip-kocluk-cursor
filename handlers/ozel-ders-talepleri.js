/**
 * Web sitesi (onlinevipdershane.com) → Özel ders talepleri
 *
 * POST ?op=webhook  — sitenin PayTR akışından gelen talep/ödeme bildirimi (x-webhook-secret)
 *   body: { event: 'order_created' | 'order_paid' | 'lead', merchant_oid?, parent_name?, phone?,
 *           email?, student_info?, teacher_slug?, package_id?, package_title?, amount_kurus?, source? }
 * GET               — talep listesi (admin/super_admin)
 * PATCH ?id=        — durum/not güncelle (admin/super_admin)
 * DELETE ?id=       — sil (super_admin)
 * GET ?op=setup     — tabloyu oluşturmayı dener (CRON_SECRET); DB URL yoksa SQL döner
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';

const TABLE = 'ozel_ders_talepleri';
const STATUSES = new Set(['pending', 'paid', 'contacted', 'enrolled', 'cancelled']);

const SETUP_SQL = `
create table if not exists public.ozel_ders_talepleri (
  id text primary key default gen_random_uuid()::text,
  merchant_oid text unique,
  status text not null default 'pending',
  parent_name text,
  phone text,
  email text,
  student_info text,
  teacher_slug text,
  package_id text,
  package_title text,
  amount_kurus bigint,
  source text default 'onlinevipdershane.com',
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ozel_ders_talepleri_status_idx
  on public.ozel_ders_talepleri (status, created_at desc);
create index if not exists ozel_ders_talepleri_merchant_oid_idx
  on public.ozel_ders_talepleri (merchant_oid);
`.trim();

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

function isSchemaMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    msg.includes('ozel_ders_talepleri')
  );
}

function schemaHint(res) {
  return res.status(503).json({
    error: 'schema_missing',
    hint: "Supabase SQL Editor'da sql/2026-07-17-ozel-ders-talepleri.sql dosyasını çalıştırın.",
    sql: SETUP_SQL
  });
}

function webhookAuthorized(req) {
  const secret = String(
    process.env.OZEL_DERS_WEBHOOK_SECRET || process.env.CRON_SECRET || ''
  ).trim();
  if (!secret) return false;
  const hdr = String(req.headers['x-webhook-secret'] || req.headers['authorization'] || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  return hdr === secret;
}

function trimOrNull(v, max = 500) {
  const s = String(v == null ? '' : v).trim();
  return s ? s.slice(0, max) : null;
}

async function handleWebhook(req, res) {
  if (!webhookAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = parseBody(req);
  const event = String(body.event || 'lead').trim();
  const merchantOid = trimOrNull(body.merchant_oid, 120);

  try {
    if (event === 'order_paid') {
      if (!merchantOid) return res.status(400).json({ error: 'merchant_oid_required' });
      const patch = {
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (body.amount_kurus != null) patch.amount_kurus = Number(body.amount_kurus) || null;

      const { data: updated, error } = await supabaseAdmin
        .from(TABLE)
        .update(patch)
        .eq('merchant_oid', merchantOid)
        .select();
      if (error) throw error;

      if (!updated || !updated.length) {
        // Sipariş kaydı token aşamasında düşmemişse ödeme bildirimi tek başına da kayıt oluşturur
        const { data, error: insErr } = await supabaseAdmin
          .from(TABLE)
          .insert({
            merchant_oid: merchantOid,
            status: 'paid',
            paid_at: new Date().toISOString(),
            amount_kurus: Number(body.amount_kurus) || null,
            source: trimOrNull(body.source, 120) || 'onlinevipdershane.com'
          })
          .select()
          .single();
        if (insErr) throw insErr;
        return res.status(200).json({ ok: true, created: true, data });
      }
      return res.status(200).json({ ok: true, updated: true, data: updated[0] });
    }

    // order_created / lead → upsert
    const row = {
      merchant_oid: merchantOid,
      status: 'pending',
      parent_name: trimOrNull(body.parent_name, 160),
      phone: trimOrNull(body.phone, 40),
      email: trimOrNull(body.email, 160),
      student_info: trimOrNull(body.student_info, 1000),
      teacher_slug: trimOrNull(body.teacher_slug, 120),
      package_id: trimOrNull(body.package_id, 60),
      package_title: trimOrNull(body.package_title, 200),
      amount_kurus: body.amount_kurus != null ? Number(body.amount_kurus) || null : null,
      source: trimOrNull(body.source, 120) || 'onlinevipdershane.com',
      updated_at: new Date().toISOString()
    };
    if (!row.parent_name && !row.phone && !row.email) {
      return res.status(400).json({ error: 'contact_info_required' });
    }

    let result;
    if (merchantOid) {
      result = await supabaseAdmin
        .from(TABLE)
        .upsert(row, { onConflict: 'merchant_oid' })
        .select()
        .single();
    } else {
      result = await supabaseAdmin.from(TABLE).insert(row).select().single();
    }
    if (result.error) throw result.error;
    return res.status(200).json({ ok: true, data: result.data });
  } catch (e) {
    if (isSchemaMissing(e)) return schemaHint(res);
    console.error('[ozel-ders-talepleri webhook]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
}

async function handleSetup(req, res) {
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok && !webhookAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { error } = await supabaseAdmin.from(TABLE).select('id').limit(1);
    if (!error) return res.status(200).json({ ok: true, created: false, message: 'Tablo zaten mevcut.' });
    if (!isSchemaMissing(error)) throw error;
  } catch (e) {
    if (!isSchemaMissing(e)) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  const dbUrl =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (!dbUrl) {
    return res.status(503).json({
      ok: false,
      error: 'missing_db_url',
      message: "Otomatik kurulamadı. Supabase SQL Editor'da aşağıdaki SQL'i çalıştırın.",
      sql: SETUP_SQL
    });
  }
  try {
    const postgres = (await import('postgres')).default;
    const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
    try {
      await sql.unsafe(SETUP_SQL);
    } finally {
      await sql.end({ timeout: 5 });
    }
    return res.status(200).json({ ok: true, created: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: errorMessage(e), sql: SETUP_SQL });
  }
}

async function requireAdminActor(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  let roleSet = new Set();
  try {
    roleSet = await actorRoleSet(actor);
  } catch {
    if (actor?.role) roleSet.add(String(actor.role).toLowerCase());
    if (Array.isArray(actor?.roles)) for (const r of actor.roles) roleSet.add(String(r || '').toLowerCase());
  }
  if (!roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return { actor, isSuper: roleSetHasSuperAdmin(roleSet) };
}

export default async function handler(req, res) {
  const op = String(req.query?.op || '').trim();

  if (req.method === 'POST' && op === 'webhook') return handleWebhook(req, res);
  if (op === 'setup') return handleSetup(req, res);

  const gate = await requireAdminActor(req, res);
  if (!gate) return;

  const id = String(req.query?.id || '').trim();

  try {
    if (req.method === 'GET') {
      const status = String(req.query?.status || '').trim();
      let q = supabaseAdmin.from(TABLE).select('*').order('created_at', { ascending: false }).limit(500);
      if (status && STATUSES.has(status)) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const body = parseBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.status != null) {
        const s = String(body.status).trim();
        if (!STATUSES.has(s)) return res.status(400).json({ error: 'invalid_status' });
        patch.status = s;
        if (s === 'paid') patch.paid_at = new Date().toISOString();
      }
      if (body.notes != null) patch.notes = trimOrNull(body.notes, 2000);
      if (body.teacher_slug != null) patch.teacher_slug = trimOrNull(body.teacher_slug, 120);
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      if (!gate.isSuper) return res.status(403).json({ error: 'forbidden' });
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await supabaseAdmin.from(TABLE).delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    if (isSchemaMissing(e)) return schemaHint(res);
    console.error('[ozel-ders-talepleri]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
}
