import crypto from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { publicAppBaseUrl } from './bbb-guest-token.js';

const CODE_LEN = 6;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function isMissingTableError(err) {
  const m = String(err?.message || err?.code || err || '').toLowerCase();
  return (
    m.includes('guest_join_short_codes') ||
    (m.includes('does not exist') && m.includes('relation')) ||
    m.includes('schema cache')
  );
}

export function guestShortPageUrl(code) {
  const c = String(code || '').trim();
  const base = publicAppBaseUrl();
  return `${base}/d/${encodeURIComponent(c)}`;
}

/**
 * DB CHECK yalnızca class/private.
 * academic-study / meeting JWT kind'ı saklanır; storage'da class + isteğe bağlı önek kullanılır.
 */
function storageKindForGuestJoin(kind) {
  return kind === 'private' ? 'private' : 'class';
}

/** Meeting UUID'lerini class_sessions ile karıştırmamak için önek. */
export function storageResourceIdForGuestJoin(kind, resourceId) {
  const rid = String(resourceId || '').trim();
  if (!rid) return '';
  if (kind === 'meeting' && !rid.startsWith('meeting:')) return `meeting:${rid}`;
  return rid;
}

export function parseMeetingStorageResourceId(resourceId) {
  const rid = String(resourceId || '').trim();
  if (rid.startsWith('meeting:')) return rid.slice('meeting:'.length);
  return '';
}

/** @returns {{ code: string, url: string } | null} */
export async function upsertGuestJoinShortCode({ kind, resourceId, token, expiresAtIso }) {
  const rid = storageResourceIdForGuestJoin(kind, resourceId);
  const tok = String(token || '').trim();
  if (!rid || !tok) return null;
  const storageKind = storageKindForGuestJoin(kind);

  const nowIso = new Date().toISOString();

  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('guest_join_short_codes')
      .select('code,expires_at')
      .eq('kind', storageKind)
      .eq('resource_id', rid)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) {
      if (isMissingTableError(findErr)) return null;
      throw findErr;
    }
    if (existing?.code) {
      return { code: String(existing.code), url: guestShortPageUrl(existing.code) };
    }
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    try {
      const { error } = await supabaseAdmin.from('guest_join_short_codes').insert({
        code,
        kind: storageKind,
        resource_id: rid,
        guest_token: tok,
        expires_at: expiresAtIso
      });
      if (error) {
        if (isMissingTableError(error)) return null;
        if (String(error.code || '') === '23505') continue;
        throw error;
      }
      return { code, url: guestShortPageUrl(code) };
    } catch (e) {
      if (isMissingTableError(e)) return null;
      if (attempt >= 5) throw e;
    }
  }
  return null;
}

export async function resolveGuestJoinShortCode(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c || c.length > 20) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('guest_join_short_codes')
      .select('kind,resource_id,guest_token,expires_at')
      .eq('code', c)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    if (!data) return null;
    if (new Date(data.expires_at) < new Date()) return null;
    return data;
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }
}
