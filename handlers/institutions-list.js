import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { getInstitutionsCache, setInstitutionsCache } from '../api/_lib/institutions-list-cache.js';
import { supabaseTimeoutMessage, withSupabaseTimeout } from '../api/_lib/supabase-query-timeout.js';

const FULL_LIST_ROLES = new Set(['super_admin', 'admin', 'coach', 'teacher', 'student']);

async function enrichActorInstitutionId(actor) {
  const out = { ...actor };
  if (String(out.institution_id || '').trim()) return out;

  try {
    const { data: u } = await withSupabaseTimeout(
      () =>
        supabaseAdmin.from('users').select('institution_id, role').eq('id', actor.sub).maybeSingle(),
      8000,
      'users_institution'
    );
    if (u?.institution_id) {
      out.institution_id = u.institution_id;
      return out;
    }

    const coachId = String(actor.coach_id || actor.sub || '').trim();
    if (coachId) {
      const { data: co } = await withSupabaseTimeout(
        () => supabaseAdmin.from('coaches').select('institution_id').eq('id', coachId).maybeSingle(),
        8000,
        'coaches_institution'
      );
      if (co?.institution_id) out.institution_id = co.institution_id;
    }
  } catch (e) {
    console.warn('[institutions-list] enrich actor', errorMessage(e));
  }
  return out;
}

async function fetchPublicInstitutionOptions() {
  const cacheKey = 'public';
  const cached = getInstitutionsCache(cacheKey);
  if (cached) return cached;

  const { data, error } = await withSupabaseTimeout(
    () =>
      supabaseAdmin
        .from('institutions')
        .select('id,name,is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(200),
    12_000,
    'institutions_public'
  );
  if (error) throw error;
  const rows = (data || []).map((r) => ({
    id: String(r.id || ''),
    name: String(r.name || '').trim() || '(Adsız)'
  }));
  setInstitutionsCache(cacheKey, rows);
  return rows;
}

async function fetchFullInstitutions(actor, role) {
  const instId = String(actor.institution_id || '').trim();
  const cacheKey = role === 'super_admin' ? 'full:super_admin' : `full:${role}:${instId || actor.sub}`;
  const cached = getInstitutionsCache(cacheKey);
  if (cached) return cached;

  let query = supabaseAdmin
    .from('institutions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (role !== 'super_admin') {
    if (!instId) return [];
    query = query.eq('id', instId);
  }

  const { data, error } = await withSupabaseTimeout(() => query, 12_000, 'institutions_full');
  if (error) throw error;
  const rows = data || [];
  setInstitutionsCache(cacheKey, rows);
  return rows;
}

/** Süper admin: veli sözleşmesi vb. ekranlarda kurum seçimi için id + ad listesi */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const wantPublic = req.query?.public === '1' || req.query?.public === 'true';
  const wantPing = req.query?.ping === '1' || req.query?.ping === 'true';
  const wantFull = req.query?.full === '1' || req.query?.full === 'true';

  if (wantPublic) {
    try {
      const rows = await fetchPublicInstitutionOptions();
      return res.status(200).json({ data: rows });
    } catch (e) {
      console.error('[institutions-list] public', errorMessage(e), e);
      return res.status(503).json({
        error: 'institutions_unavailable',
        message: supabaseTimeoutMessage(e)
      });
    }
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '').toLowerCase();

  if (wantPing) {
    try {
      const { error } = await withSupabaseTimeout(
        () => supabaseAdmin.from('institutions').select('id').limit(1),
        8000,
        'institutions_ping'
      );
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[institutions-list] ping', errorMessage(e), e);
      return res.status(503).json({ error: 'supabase_unreachable', message: supabaseTimeoutMessage(e) });
    }
  }

  if (wantFull) {
    if (!FULL_LIST_ROLES.has(role)) return res.status(403).json({ error: 'forbidden' });

    try {
      actor = await enrichActorInstitutionId(actor);
      const rows = await fetchFullInstitutions(actor, role);
      return res.status(200).json({ data: rows });
    } catch (e) {
      console.error('[institutions-list] full', errorMessage(e), e);
      return res.status(503).json({
        error: 'institutions_unavailable',
        message: supabaseTimeoutMessage(e)
      });
    }
  }

  if (role !== 'super_admin') return res.status(403).json({ error: 'forbidden' });

  try {
    const cacheKey = 'picker:super_admin';
    const cached = getInstitutionsCache(cacheKey);
    if (cached) return res.status(200).json({ data: cached });

    const { data, error } = await withSupabaseTimeout(
      () =>
        supabaseAdmin
          .from('institutions')
          .select('id,name')
          .order('name', { ascending: true })
          .limit(500),
      12_000,
      'institutions_picker'
    );
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      id: String(r.id || ''),
      name: String(r.name || '').trim() || '(Adsız)'
    }));
    setInstitutionsCache(cacheKey, rows);
    return res.status(200).json({ data: rows });
  } catch (e) {
    console.error('[institutions-list]', errorMessage(e), e);
    return res.status(503).json({
      error: 'institutions_unavailable',
      message: supabaseTimeoutMessage(e)
    });
  }
}
