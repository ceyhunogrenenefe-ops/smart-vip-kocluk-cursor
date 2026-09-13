/**
 * CRM inbox schema — otomatik kurulum + teşhis (Supabase DDL).
 * Kod `message_id` kullanır; eski migration `external_message_id` ise uyumluluk eklenir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getMetaWebhookEnvStatus } from './meta-whatsapp.js';

const PRIMARY_CRM_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

async function resolveInboundInstitutionId() {
  const envId = String(
    process.env.CRM_INBOUND_INSTITUTION_ID ||
      process.env.REGISTRATION_INBOUND_INSTITUTION_ID ||
      process.env.META_WHATSAPP_DEFAULT_INSTITUTION_ID ||
      process.env.DEFAULT_INSTITUTION_ID ||
      ''
  ).trim();
  if (envId) return envId;
  try {
    const { data: primary } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .eq('id', PRIMARY_CRM_INSTITUTION_ID)
      .maybeSingle();
    if (primary?.id) return primary.id;
  } catch {
    /* fallback */
  }
  try {
    const { data } = await supabaseAdmin.from('institutions').select('id').limit(1);
    return data?.[0]?.id || null;
  } catch {
    return null;
  }
}

const CRM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.crm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES public.institutions(id) ON DELETE SET NULL,
  contact_identifier text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'instagram')),
  contact_name text NULL,
  assigned_user_id text NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  lead_id uuid NULL,
  ad_source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz NULL,
  last_message_preview text NULL,
  unread_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_conv_inst_channel_contact
  ON public.crm_conversations (institution_id, channel, contact_identifier);

CREATE INDEX IF NOT EXISTS idx_crm_conv_assigned
  ON public.crm_conversations (assigned_user_id, status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_conv_pool
  ON public.crm_conversations (institution_id, status, last_message_at DESC NULLS LAST)
  WHERE assigned_user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  institution_id text NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('lead', 'agent', 'bot', 'system')),
  sender_id text NULL,
  body text NULL,
  media_url text NULL,
  message_type text NOT NULL DEFAULT 'text',
  message_id text NULL,
  delivery_status text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_messages_message_id
  ON public.crm_messages (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_messages_conv_time
  ON public.crm_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.crm_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institution_id text NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  can_access_unassigned_pool boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_by text NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_assignments_active
  ON public.crm_user_assignments (institution_id, is_active)
  WHERE is_active = true;

ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS external_message_id text;
UPDATE public.crm_messages
SET message_id = external_message_id
WHERE message_id IS NULL AND external_message_id IS NOT NULL;
UPDATE public.crm_messages
SET external_message_id = message_id
WHERE external_message_id IS NULL AND message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_messages_external
  ON public.crm_messages (external_message_id)
  WHERE external_message_id IS NOT NULL;
`.trim();

const AUTO_SCHEMA_HINT =
  'CRM tabloları yok. Supabase SQL Editor: student-coaching-system/sql/2026-09-12-crm-inbox-rbac.sql — veya Vercel’de SUPABASE_DB_URL / DATABASE_URL ile /api/setup-crm-inbox-schema otomatik kurar.';

let schemaReadyCache = null;
let schemaEnsureInFlight = null;
/** @type {'message_id'|'external_message_id'|null} */
let cachedMetaIdColumn = null;

function supabaseProjectRef() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] || '';
}

function buildDatabaseUrl() {
  const direct =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DATABASE_URL?.trim();
  if (direct) return direct;
  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    process.env.POSTGRES_PASSWORD?.trim() ||
    process.env.SUPABASE_DATABASE_PASSWORD?.trim();
  const ref = supabaseProjectRef();
  if (!password || !ref) return '';
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

function isSchemaMissingError(error) {
  const msg = String(error?.message || error || '');
  return /crm_conversations|crm_messages|crm_user_assignments|schema cache|PGRST|does not exist|relation/i.test(
    msg
  );
}

async function probeCrmSchema() {
  const conv = await supabaseAdmin.from('crm_conversations').select('id').limit(1);
  if (conv.error && isSchemaMissingError(conv.error)) return false;
  if (conv.error) throw conv.error;
  const msg = await supabaseAdmin.from('crm_messages').select('id').limit(1);
  if (msg.error && isSchemaMissingError(msg.error)) return false;
  if (msg.error) throw msg.error;
  return true;
}

async function runCrmSchemaSql() {
  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) {
    return { ok: false, code: 'missing_db_url', message: AUTO_SCHEMA_HINT };
  }
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(CRM_SCHEMA_SQL);
    return { ok: true, via: 'postgres' };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

export async function ensureCrmInboxSchema({ force = false } = {}) {
  if (!force && schemaReadyCache === true) {
    return { ok: true, created: false, cached: true, via: 'sql' };
  }
  if (!force && schemaEnsureInFlight) return schemaEnsureInFlight;

  schemaEnsureInFlight = (async () => {
    try {
      if (!force) {
        const ready = await probeCrmSchema();
        if (ready) {
          schemaReadyCache = true;
          cachedMetaIdColumn = null;
          return { ok: true, created: false, via: 'sql' };
        }
      }

      const ran = await runCrmSchemaSql();
      if (ran.ok) {
        let ready = false;
        for (let i = 0; i < 6; i += 1) {
          await new Promise((r) => setTimeout(r, 250 * (i + 1)));
          ready = await probeCrmSchema().catch(() => false);
          if (ready) break;
        }
        if (ready) {
          schemaReadyCache = true;
          cachedMetaIdColumn = null;
          return { ok: true, created: true, via: ran.via || 'postgres' };
        }
        return {
          ok: false,
          code: 'schema_created_but_invisible',
          message: 'DDL çalıştı ama PostgREST henüz görmüyor — birkaç saniye bekleyip tekrar deneyin.'
        };
      }

      return {
        ok: false,
        code: ran.code || 'schema_setup_failed',
        message: ran.message || AUTO_SCHEMA_HINT,
        has_db_url: Boolean(buildDatabaseUrl())
      };
    } finally {
      schemaEnsureInFlight = null;
    }
  })();

  return schemaEnsureInFlight;
}

async function columnSelectable(column) {
  const { error } = await supabaseAdmin.from('crm_messages').select(column).limit(1);
  if (!error) return true;
  return !/column|does not exist|schema cache/i.test(error.message || '');
}

/** Meta wamid sütun adı — message_id (yeni) veya external_message_id (eski migration). */
export async function resolveCrmMessageIdColumn() {
  if (cachedMetaIdColumn) return cachedMetaIdColumn;
  if (await columnSelectable('message_id')) {
    cachedMetaIdColumn = 'message_id';
    return cachedMetaIdColumn;
  }
  if (await columnSelectable('external_message_id')) {
    cachedMetaIdColumn = 'external_message_id';
    return cachedMetaIdColumn;
  }
  cachedMetaIdColumn = 'message_id';
  return cachedMetaIdColumn;
}

export async function diagnoseCrmInbox() {
  const inboundInstitutionId = await resolveInboundInstitutionId().catch(() => null);
  const webhook = getMetaWebhookEnvStatus();

  /** @type {Record<string, unknown>} */
  const out = {
    tables: {
      crm_conversations: { ok: false, count: null, error: null },
      crm_messages: { ok: false, count: null, error: null, meta_id_column: null },
      crm_user_assignments: { ok: false, count: null, error: null },
      meta_webhook_hits: { ok: false, count: null, error: null },
      registration_channel_messages: { ok: false, count: null, error: null }
    },
    inbound_institution_id: inboundInstitutionId,
    webhook,
    recent_crm_conversations: [],
    recent_webhook_hits: [],
    recent_registration_messages: [],
    hints: [],
    has_db_url: Boolean(buildDatabaseUrl())
  };

  for (const table of [
    'crm_conversations',
    'crm_messages',
    'crm_user_assignments',
    'meta_webhook_hits',
    'registration_channel_messages'
  ]) {
    try {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      out.tables[table] = { ok: true, count, error: null };
    } catch (e) {
      out.tables[table] = {
        ok: false,
        count: null,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  if (out.tables.crm_messages.ok) {
    out.tables.crm_messages.meta_id_column = await resolveCrmMessageIdColumn();
  }

  if (out.tables.crm_conversations.ok) {
    try {
      let q = supabaseAdmin
        .from('crm_conversations')
        .select(
          'id, institution_id, channel, contact_identifier, contact_name, last_message_preview, last_message_at, unread_count, created_at'
        )
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(8);
      if (inboundInstitutionId) q = q.eq('institution_id', inboundInstitutionId);
      const { data } = await q;
      out.recent_crm_conversations = data || [];
    } catch {
      /* ignore */
    }
  }

  if (out.tables.meta_webhook_hits.ok) {
    try {
      const { data } = await supabaseAdmin
        .from('meta_webhook_hits')
        .select(
          'received_at, object_type, field, message_count, status_count, phone_number_id, display_phone, wa_from, sample'
        )
        .order('received_at', { ascending: false })
        .limit(12);
      out.recent_webhook_hits = data || [];
    } catch {
      /* ignore */
    }
  }

  if (out.tables.registration_channel_messages.ok) {
    try {
      const { data } = await supabaseAdmin
        .from('registration_channel_messages')
        .select('id, channel, direction, phone, body, occurred_at, institution_id')
        .order('created_at', { ascending: false })
        .limit(8);
      out.recent_registration_messages = data || [];
    } catch {
      /* ignore */
    }
  }

  if (!out.tables.crm_conversations.ok || !out.tables.crm_messages.ok) {
    out.hints.push(AUTO_SCHEMA_HINT);
  } else if ((out.tables.crm_conversations.count || 0) === 0) {
    const hits = out.recent_webhook_hits || [];
    const inboundHits = hits.filter((h) => Number(h.message_count || 0) > 0);
    if (!inboundHits.length) {
      out.hints.push(
        'Meta webhook son 12 kayıtta inbound message yok — BM’de messages aboneliği + 0850 Cloud API numarası (QR gateway değil) kontrol edin.'
      );
    } else {
      out.hints.push(
        'Webhook inbound görüyor ama CRM boş — institution_id veya message_id sütun uyumsuzluğu olabilir; redeploy sonrası tekrar deneyin.'
      );
    }
  }

  if (!webhook.configured) {
    out.hints.push('META_WEBHOOK_VERIFY_TOKEN eksik — Meta webhook doğrulaması / teslimat güncellemesi sorunlu olabilir.');
  }

  const tablesOk = Boolean(out.tables.crm_conversations.ok && out.tables.crm_messages.ok);
  const hasInbound =
    Number(out.tables.crm_conversations.count || 0) > 0 ||
    (out.recent_webhook_hits || []).some((h) => Number(h.message_count || 0) > 0);
  out.e2e_ready = {
    webhook_verify_configured: Boolean(webhook.configured),
    webhook_url: webhook.webhook_url,
    crm_tables_ok: tablesOk,
    meta_send_configured: null, // health endpoint doldurur
    inbound_seen: hasInbound,
    ready: Boolean(webhook.configured && tablesOk),
    checklist: [
      'GET /api/meta/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… → 200 + challenge',
      'POST WA payload → wa_ingested≥1 ve crm_conversations artar',
      'CRM Inbox’tan yanıt → Graph /{phone_number_id}/messages (META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID)',
      'IG DM: object=instagram + entry[].messaging[] → crm channel=instagram'
    ]
  };

  out.ok = tablesOk;
  return out;
}
