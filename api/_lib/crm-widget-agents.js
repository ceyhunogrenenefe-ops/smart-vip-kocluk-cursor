/**
 * Widget temsilci kadrosu.
 * Temsilciler ekranı yalnız buraya eklenen kişileri gösterir.
 * Online VIP kadrosundaki dört isim, ilk açılışta WhatsApp / Instagram / Facebook widget’lerine yazılır.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { updateCrmSettings } from './crm-assignment.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';

export const CRM_WIDGET_AGENTS_TABLE = 'crm_widget_agents';

/** İlk kadro — widget’lere elle eklenmiş temsilciler */
export const SEEDED_AGENT_NAMES = [
  'sultan kurt',
  'muzaffer apaydin',
  'dogan akturk',
  'ceyhun ogrenenefe'
];

/** Bu kanallara ilk kadro bağlanır; sonra widget başına ekleme listeyi büyütür */
export const SEEDED_WIDGET_IDS = ['whatsapp_business', 'instagram', 'facebook'];

const WIDGET_ID_RE = /^[a-z0-9_]{2,40}$/;

export const CRM_WIDGET_AGENTS_SETUP_SQL = `
CREATE TABLE IF NOT EXISTS public.crm_widget_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL,
  widget_id text NOT NULL,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, widget_id, user_id)
);
CREATE INDEX IF NOT EXISTS crm_widget_agents_inst_idx
  ON public.crm_widget_agents (institution_id, widget_id);
ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS widget_agents_seeded boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
`.trim();

const SCHEMA_MISSING_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);

let schemaReady = false;
const seededInstitutions = new Set();

export function foldPersonName(value) {
  return String(value || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSeedAgentName(name) {
  return SEEDED_AGENT_NAMES.includes(foldPersonName(name));
}

/**
 * Aynı addan birden fazla hesap varsa kurum eşleşenini, yoksa ilk aktif kaydı seçer.
 */
export function pickSeedUsers(rows, institutionId = PLATFORM_PRIMARY_INSTITUTION_ID) {
  const inst = String(institutionId || '').trim();
  const byName = new Map();
  for (const row of rows || []) {
    if (!row?.id || row.is_active === false) continue;
    const key = foldPersonName(row.name);
    if (!SEEDED_AGENT_NAMES.includes(key)) continue;
    const list = byName.get(key) || [];
    list.push(row);
    byName.set(key, list);
  }
  const picked = [];
  for (const list of byName.values()) {
    const onInst = list.filter((u) => {
      const id = String(u.institution_id || '').trim();
      return !id || id === inst;
    });
    const chosen = onInst[0] || list[0];
    if (chosen?.id) picked.push(chosen);
  }
  return picked;
}

function isSchemaMissing(error) {
  const code = String(error?.code || '').trim();
  if (code && SCHEMA_MISSING_CODES.has(code)) return true;
  const msg = String(error?.message || error || '');
  return (
    /schema cache/i.test(msg) ||
    /could not find the (table|column)/i.test(msg) ||
    /relation\s+"[^"]+"\s+does not exist/i.test(msg) ||
    /column\s+[^\s]+\s+does not exist/i.test(msg)
  );
}

function buildDatabaseUrl() {
  const direct =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DATABASE_URL?.trim();
  if (direct) return direct;
  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    process.env.POSTGRES_PASSWORD?.trim() ||
    process.env.SUPABASE_DATABASE_PASSWORD?.trim();
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
  if (!password || !ref) return '';
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

export function assertWidgetId(widgetId) {
  const id = String(widgetId || '').trim();
  if (!WIDGET_ID_RE.test(id)) {
    const err = new Error('widget_id_invalid');
    err.code = 'widget_id_invalid';
    throw err;
  }
  return id;
}

export async function ensureCrmWidgetAgentsSchema() {
  if (schemaReady) return { ok: true, skipped: true };
  const tableProbe = await supabaseAdmin.from(CRM_WIDGET_AGENTS_TABLE).select('id').limit(1);
  const flagProbe = await supabaseAdmin.from('crm_settings').select('widget_agents_seeded').limit(1);
  const missing =
    (tableProbe.error && isSchemaMissing(tableProbe.error)) ||
    (flagProbe.error && isSchemaMissing(flagProbe.error));
  if (!missing && !tableProbe.error && !flagProbe.error) {
    schemaReady = true;
    return { ok: true, created: false };
  }
  if (!missing) {
    throw tableProbe.error || flagProbe.error;
  }
  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) {
    const err = new Error('crm_widget_agents_schema_missing');
    err.code = 'schema_missing';
    throw err;
  }
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(CRM_WIDGET_AGENTS_SETUP_SQL);
    schemaReady = true;
    return { ok: true, created: true };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

function normalizeRoles(primary, rolesArr) {
  const set = new Set();
  if (primary) set.add(String(primary).toLowerCase());
  if (Array.isArray(rolesArr)) {
    for (const r of rolesArr) {
      const t = String(r || '').toLowerCase().trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

function groupRows(rows) {
  const byUser = new Map();
  const byWidget = {};
  for (const row of rows || []) {
    const widgetId = String(row.widget_id || '').trim();
    if (!widgetId || widgetId.startsWith('__')) continue;
    const u = row.users;
    if (!u?.id || u.is_active === false) continue;
    const id = String(u.id);
    const prev = byUser.get(id) || {
      id,
      name: u.name || '',
      email: u.email || '',
      role: u.role || '',
      roles: u.roles || [],
      widget_ids: []
    };
    if (!prev.widget_ids.includes(widgetId)) prev.widget_ids.push(widgetId);
    byUser.set(id, prev);
    if (!byWidget[widgetId]) byWidget[widgetId] = [];
    if (!byWidget[widgetId].some((x) => x.id === id)) {
      byWidget[widgetId].push({ id, name: u.name || '', email: u.email || '' });
    }
  }
  const items = [...byUser.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id)
  );
  for (const list of Object.values(byWidget)) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
  }
  return { items, by_widget: byWidget };
}

async function readRows(institutionId) {
  const { data, error } = await supabaseAdmin
    .from(CRM_WIDGET_AGENTS_TABLE)
    .select('widget_id, user_id, users:user_id(id, name, email, role, roles, is_active)')
    .eq('institution_id', institutionId);
  if (error) throw error;
  return data || [];
}

async function markRosterActive(institutionId, actorId) {
  try {
    await updateCrmSettings(institutionId, { widget_agents_seeded: true }, actorId || null);
  } catch (e) {
    if (!isSchemaMissing(e)) throw e;
    schemaReady = false;
    await ensureCrmWidgetAgentsSchema();
    await updateCrmSettings(institutionId, { widget_agents_seeded: true }, actorId || null);
  }
}

async function ensureCrmAgentRecord(user, institutionId, actorId) {
  const roles = normalizeRoles(user.role, user.roles);
  if (!roles.includes('crm_agent')) roles.push('crm_agent');
  const keepPrimary = ['super_admin', 'admin', 'coach', 'teacher'].includes(
    String(user.role || '').toLowerCase()
  );
  const patch = { roles, updated_at: new Date().toISOString() };
  if (!keepPrimary) patch.role = 'crm_agent';
  const { error: upErr } = await supabaseAdmin.from('users').update(patch).eq('id', user.id);
  if (upErr) throw upErr;

  const assignment = {
    user_id: user.id,
    institution_id: institutionId,
    can_access_unassigned_pool: true,
    is_active: true,
    in_round_robin: true,
    created_by: actorId || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseAdmin
    .from('crm_user_assignments')
    .upsert(assignment, { onConflict: 'user_id,institution_id' });
  if (error && /in_round_robin|column/i.test(error.message || '')) {
    delete assignment.in_round_robin;
    const retry = await supabaseAdmin
      .from('crm_user_assignments')
      .upsert(assignment, { onConflict: 'user_id,institution_id' });
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
}

async function seedPlatformRoster(institutionId, actorId) {
  if (String(institutionId) !== PLATFORM_PRIMARY_INSTITUTION_ID) return;
  if (seededInstitutions.has(institutionId)) return;

  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from('crm_settings')
    .select('widget_agents_seeded')
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (settings?.widget_agents_seeded) {
    seededInstitutions.add(institutionId);
    return;
  }

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, roles, institution_id, is_active')
    .or(
      [
        'name.ilike.%Sultan Kurt%',
        'name.ilike.%Muzaffer%',
        'name.ilike.%Aktürk%',
        'name.ilike.%Akturk%',
        'name.ilike.%Öğrenenefe%',
        'name.ilike.%Ogrenenefe%'
      ].join(',')
    )
    .limit(50);
  if (error) throw error;

  const picked = pickSeedUsers(users || [], institutionId);
  if (!picked.length) {
    seededInstitutions.add(institutionId);
    console.warn('[crm-widget-agents] ilk kadro bulunamadı');
    return;
  }
  const now = new Date().toISOString();
  for (const user of picked) {
    await ensureCrmAgentRecord(user, institutionId, actorId);
    const rows = SEEDED_WIDGET_IDS.map((widgetId) => ({
      institution_id: institutionId,
      widget_id: widgetId,
      user_id: user.id,
      created_by: actorId || null,
      created_at: now
    }));
    const { error: insErr } = await supabaseAdmin
      .from(CRM_WIDGET_AGENTS_TABLE)
      .upsert(rows, { onConflict: 'institution_id,widget_id,user_id' });
    if (insErr) throw insErr;
  }

  await markRosterActive(institutionId, actorId);
  seededInstitutions.add(institutionId);
  if (picked.length < SEEDED_AGENT_NAMES.length) {
    console.warn(
      '[crm-widget-agents] ilk kadro eksik eşleşti:',
      picked.map((u) => u.name).join(', ')
    );
  }
}

export async function listWidgetAgents(institutionId, actorId = null) {
  const inst = String(institutionId || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
  await ensureCrmWidgetAgentsSchema();
  await seedPlatformRoster(inst, actorId);
  const rows = await readRows(inst);
  return groupRows(rows).items;
}

export async function listWidgetAgentIds(institutionId) {
  const inst = String(institutionId || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
  const { data, error } = await supabaseAdmin
    .from(CRM_WIDGET_AGENTS_TABLE)
    .select('user_id')
    .eq('institution_id', inst);
  if (error) {
    if (isSchemaMissing(error)) return [];
    throw error;
  }
  return [...new Set((data || []).map((r) => String(r.user_id || '')).filter(Boolean))];
}

async function listCandidates(institutionId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, institution_id, is_active')
    .in('role', ['crm_agent', 'coach', 'admin', 'super_admin', 'teacher'])
    .limit(500);
  if (error) throw error;
  return (data || [])
    .filter((u) => {
      if (u.is_active === false || !u.id) return false;
      const id = String(u.institution_id || '').trim();
      return !id || id === institutionId;
    })
    .map((u) => ({ id: String(u.id), name: u.name || '', email: u.email || '', role: u.role || '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
}

export async function getWidgetAgentDirectory(institutionId, actorId = null) {
  const inst = String(institutionId || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
  await ensureCrmWidgetAgentsSchema();
  await seedPlatformRoster(inst, actorId);
  const [rows, candidates] = await Promise.all([readRows(inst), listCandidates(inst)]);
  const grouped = groupRows(rows);
  return { ...grouped, candidates };
}

export async function addWidgetAgent({ institutionId, widgetId, userId, actorId }) {
  const inst = String(institutionId || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
  const widget = assertWidgetId(widgetId);
  const uid = String(userId || '').trim();
  if (!uid) {
    const err = new Error('user_id_required');
    err.code = 'user_id_required';
    throw err;
  }
  await ensureCrmWidgetAgentsSchema();
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, roles, institution_id, is_active')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!user || user.is_active === false) {
    const err = new Error('user_not_found');
    err.code = 'user_not_found';
    throw err;
  }
  await ensureCrmAgentRecord(user, inst, actorId);
  const { error: insErr } = await supabaseAdmin.from(CRM_WIDGET_AGENTS_TABLE).upsert(
    {
      institution_id: inst,
      widget_id: widget,
      user_id: uid,
      created_by: actorId || null,
      created_at: new Date().toISOString()
    },
    { onConflict: 'institution_id,widget_id,user_id' }
  );
  if (insErr) throw insErr;
  await markRosterActive(inst, actorId);
  seededInstitutions.add(inst);
  return getWidgetAgentDirectory(inst, actorId);
}

export async function removeWidgetAgent({ institutionId, widgetId, userId, actorId }) {
  const inst = String(institutionId || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
  const widget = assertWidgetId(widgetId);
  const uid = String(userId || '').trim();
  if (!uid) {
    const err = new Error('user_id_required');
    err.code = 'user_id_required';
    throw err;
  }
  await ensureCrmWidgetAgentsSchema();
  const { error } = await supabaseAdmin
    .from(CRM_WIDGET_AGENTS_TABLE)
    .delete()
    .eq('institution_id', inst)
    .eq('widget_id', widget)
    .eq('user_id', uid);
  if (error) throw error;
  await markRosterActive(inst, actorId);
  seededInstitutions.add(inst);
  return getWidgetAgentDirectory(inst, actorId);
}

export async function removeUserFromWidgetRoster(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const { error } = await supabaseAdmin.from(CRM_WIDGET_AGENTS_TABLE).delete().eq('user_id', uid);
  if (error && !isSchemaMissing(error)) throw error;
}
