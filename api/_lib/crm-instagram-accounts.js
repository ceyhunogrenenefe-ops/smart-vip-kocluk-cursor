/**
 * Ek Instagram hesapları (aynı kurumun birden fazla IG işletme hesabı).
 *
 * Birincil (ana) hesap eskisi gibi platform / kurum Meta bağlantısından gelir
 * (META_PAGE_TOKEN, META_PAGE_ID, META_IG_BUSINESS_ID, commerce_settings.meta
 * veya crm_meta_connections). Ek hesaplar `crm_instagram_accounts` tablosunda
 * tutulur; her satır kendi sayfa erişim anahtarını ve sayfa kimliğini taşır.
 *
 * GERİYE UYUM
 * - Tablo yoksa (henüz SQL uygulanmadıysa) her hesap birincil sayılır → eski
 *   davranış birebir aynı.
 * - Tabloda kaydı olmayan IG hesabı birincil sayılır.
 *
 * GÜVENLİK: page_token hiçbir zaman istemciye düz gönderilmez ve loglanmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { isPlatformInstitutionId, maskSecret, resolveMetaConnection } from './crm-meta-connection.js';

export const INSTAGRAM_ACCOUNTS_TABLE = 'crm_instagram_accounts';

export function graphVersion() {
  return String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
}

/** Tablo henüz oluşturulmamış mı? (42P01 / PostgREST şema önbelleği) */
export function accountsTableMissing(error) {
  if (!error) return false;
  if (String(error.code || '') === '42P01' || String(error.code || '') === 'PGRST205') return true;
  return /does not exist|schema cache|PGRST205/i.test(String(error.message || ''));
}

/** Kurum kimliğini tabloya yazılacak hâle getirir: platform kurumu → null. */
export function storedInstitutionId(institutionId) {
  return isPlatformInstitutionId(institutionId) ? null : String(institutionId).trim();
}

/** İki kurum kimliği aynı kurumu mu gösteriyor? (null ≡ platform kurumu) */
export function sameInstitution(a, b) {
  return storedInstitutionId(a) === storedInstitutionId(b);
}

/** Panelde gösterilecek satır — token maskeli. */
export function publicAccountRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    institution_id: row.institution_id ?? null,
    ig_user_id: row.ig_user_id,
    ig_username: row.ig_username || null,
    page_id: row.page_id || null,
    token_masked: maskSecret(row.page_token),
    has_token: Boolean(String(row.page_token || '').trim()),
    is_active: row.is_active !== false,
    last_verified_at: row.last_verified_at || null,
    last_verify_error: row.last_verify_error || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

/**
 * Birincil hesabın IG işletme kimliği (bilinmiyorsa '').
 * Platform/kurum bağlantısı + env yedeği.
 */
export async function primaryInstagramIgUserId(institutionId) {
  let id = '';
  try {
    const conn = await resolveMetaConnection(institutionId);
    id = String(conn?.instagram?.igUserId || '').trim();
  } catch {
    /* bağlantı okunamadı — env yedeği */
  }
  if (!id && isPlatformInstitutionId(institutionId)) {
    try {
      const { igBusinessIdEnv } = await import('./meta-social-inbound.js');
      id = String(igBusinessIdEnv() || '').trim();
    } catch {
      /* yok say */
    }
  }
  return id;
}

/** Tablodan IG kimliğine göre ek hesap satırı. Tablo yoksa null. */
export async function getInstagramAccountRow(igUserId) {
  const ig = String(igUserId || '').trim();
  if (!ig) return null;
  const { data, error } = await supabaseAdmin
    .from(INSTAGRAM_ACCOUNTS_TABLE)
    .select('*')
    .eq('ig_user_id', ig)
    .maybeSingle();
  if (error) {
    if (accountsTableMissing(error)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Yorumun / mesajın geldiği IG hesabı için gönderim bilgisi.
 *
 * Dönüş:
 * - `{ isPrimary: true, igUserId, institutionId }` → birincil hesap; çağıran
 *   gönderim fonksiyonlarına override GEÇMEZ, eski çözüm aynen kullanılır.
 * - `{ isPrimary: false, igUserId, username, token, pageId, institutionId, id }`
 *   → ek hesap; gönderimler bu token / sayfa ile yapılır.
 * - `null` → ek hesap kayıtlı ama pasif (ya da başka kuruma ait / anahtarı
 *   eksik); otomasyon çalışmaz.
 *
 * @param {{ institutionId?: string|null, igUserId?: string|null }} args
 */
export async function resolveInstagramAccount({ institutionId, igUserId } = {}) {
  const ig = String(igUserId || '').trim();
  const primary = { isPrimary: true, igUserId: ig, institutionId: institutionId || null };
  if (!ig) return primary;

  let row = null;
  try {
    row = await getInstagramAccountRow(ig);
  } catch (e) {
    // Okuma hatasında eski davranışa düş: hesap birincil sayılır
    console.warn('[crm-instagram-accounts] hesap okunamadı:', errorMessage(e));
    return primary;
  }
  if (!row) return primary;

  // Aynı kimlik birincil hesapsa (yanlışlıkla eklenmiş) birincil çözüm kullanılır
  const primaryId = await primaryInstagramIgUserId(row.institution_id ?? institutionId);
  if (primaryId && primaryId === ig) return primary;

  if (institutionId !== undefined && institutionId !== null && !sameInstitution(row.institution_id, institutionId)) {
    return null;
  }
  if (row.is_active === false) return null;

  const token = String(row.page_token || '').trim();
  const pageId = String(row.page_id || '').trim();
  if (!token) return null;

  return {
    isPrimary: false,
    id: row.id,
    igUserId: ig,
    username: row.ig_username || null,
    token,
    pageId,
    institutionId: row.institution_id ?? null
  };
}

/** Çözümlenmiş hesaptan gönderim override'ı: birincil hesapta undefined. */
export function sendOverrideFor(account) {
  if (!account || account.isPrimary) return undefined;
  return { token: account.token, pageId: account.pageId, igUserId: account.igUserId };
}

/** Kurumun ek hesapları (panel listesi için ham satırlar). Tablo yoksa []. */
export async function listInstagramAccountRows(institutionId) {
  const inst = storedInstitutionId(institutionId);
  let q = supabaseAdmin
    .from(INSTAGRAM_ACCOUNTS_TABLE)
    .select('*')
    .order('created_at', { ascending: true });
  q = inst ? q.eq('institution_id', inst) : q.is('institution_id', null);
  const { data, error } = await q;
  if (error) {
    if (accountsTableMissing(error)) return { rows: [], tableMissing: true };
    throw error;
  }
  return { rows: data || [], tableMissing: false };
}

/**
 * Sayfa erişim anahtarını Graph API ile doğrular ve bağlı IG işletme
 * hesabını bulur: GET /{page_id}?fields=instagram_business_account{id,username}
 */
export async function verifyPageInstagramAccount({ pageId, token }) {
  const page = String(pageId || '').trim();
  const tok = String(token || '').trim();
  if (!page || !tok) return { ok: false, error: 'Sayfa kimliği ve sayfa erişim anahtarı gerekli.' };
  const url =
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(page)}` +
    `?fields=${encodeURIComponent('name,instagram_business_account{id,username}')}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}` },
      signal: AbortSignal.timeout(12000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
    const iba = json?.instagram_business_account;
    if (!iba?.id) {
      return {
        ok: false,
        error: 'Bu Facebook sayfasına bağlı bir Instagram işletme hesabı bulunamadı.'
      };
    }
    return {
      ok: true,
      page_name: json?.name || null,
      ig_user_id: String(iba.id),
      ig_username: iba.username ? String(iba.username) : null
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Sayfayı uygulamanın webhook'una abone eder (Instagram yorum / mesaj
 * olayları için Meta bunu ister): POST /{page_id}/subscribed_apps
 */
export async function subscribePageToApp({ pageId, token, fields = 'feed,messages' }) {
  const page = String(pageId || '').trim();
  const tok = String(token || '').trim();
  if (!page || !tok) return { ok: false, error: 'Sayfa kimliği ve sayfa erişim anahtarı gerekli.' };
  const url =
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(page)}/subscribed_apps` +
    `?subscribed_fields=${encodeURIComponent(fields)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
      signal: AbortSignal.timeout(12000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}`, fields };
    }
    return { ok: json?.success !== false, fields };
  } catch (e) {
    return { ok: false, error: errorMessage(e), fields };
  }
}

/* ------------------------------------------------------------------ */
/* DM desteği: gelen mesajın / yanıtın hangi ek hesaba ait olduğu      */
/* ------------------------------------------------------------------ */

const RESOLVE_CACHE_MS = 60_000;
const resolveCache = new Map();
let extraIdsCache = { at: 0, ids: null };

/** Önbellekli resolveInstagramAccount (webhook başına çok olay gelebilir). */
export async function resolveInstagramAccountCached(igUserId) {
  const ig = String(igUserId || '').trim();
  if (!ig) return { isPrimary: true, igUserId: '' };
  const hit = resolveCache.get(ig);
  if (hit && Date.now() - hit.at < RESOLVE_CACHE_MS) return hit.value;
  const value = await resolveInstagramAccount({ igUserId: ig });
  if (resolveCache.size > 200) resolveCache.clear();
  resolveCache.set(ig, { at: Date.now(), value });
  return value;
}

/** Etkin ek hesapların IG kimlikleri (webhook kanal tespiti için). Tablo yoksa boş küme. */
export async function extraInstagramIgUserIds() {
  if (extraIdsCache.ids && Date.now() - extraIdsCache.at < RESOLVE_CACHE_MS) return extraIdsCache.ids;
  const ids = new Set();
  try {
    const { data, error } = await supabaseAdmin
      .from(INSTAGRAM_ACCOUNTS_TABLE)
      .select('ig_user_id, is_active')
      .limit(200);
    if (!error) for (const r of data || []) if (r.is_active !== false && r.ig_user_id) ids.add(String(r.ig_user_id));
  } catch {
    /* tablo yok → boş */
  }
  extraIdsCache = { at: Date.now(), ids };
  return ids;
}

export function clearInstagramAccountCaches() {
  resolveCache.clear();
  extraIdsCache = { at: 0, ids: null };
}

/**
 * Bir konuşmanın (IG kapsamlı kişi kimliği) hangi ek hesaba geldiğini bulur ve
 * o hesabın gönderim override'ını döner. Birincil hesapta / bulunamazsa undefined.
 * IGSID hesaba özgü olduğundan aynı kimlik iki hesapta çakışmaz.
 */
export async function sendOverrideForContact(igScopedId) {
  const contact = String(igScopedId || '').trim();
  if (!contact) return undefined;
  const ids = await extraInstagramIgUserIds();
  if (!ids.size) return undefined;
  try {
    const { data } = await supabaseAdmin
      .from('crm_conversations')
      .select('ad_source_data')
      .eq('contact_identifier', contact)
      .in('channel', ['instagram', 'facebook'])
      .order('last_message_at', { ascending: false })
      .limit(1);
    const ig = String(data?.[0]?.ad_source_data?.ig_account_id || '').trim();
    if (!ig || !ids.has(ig)) return undefined;
    return sendOverrideFor(await resolveInstagramAccountCached(ig));
  } catch {
    return undefined;
  }
}

/**
 * Facebook ile giriş sonrası: kullanıcının yönettiği sayfalardan, Instagram
 * işletme hesabı bağlı olup ana hesap OLMAYANLARI döner (sayfa anahtarlarıyla).
 * Anahtarlar yalnız sunucuda kalır.
 */
export async function listExtraInstagramCandidates(userToken, institutionId) {
  const tok = String(userToken || '').trim();
  if (!tok) return { ok: false, error: 'user_token_missing', candidates: [] };
  const url =
    `https://graph.facebook.com/${graphVersion()}/me/accounts` +
    `?fields=${encodeURIComponent('id,name,access_token,instagram_business_account{id,username}')}&limit=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) return { ok: false, error: json?.error?.message || `HTTP ${res.status}`, candidates: [] };
  const primaryId = await primaryInstagramIgUserId(institutionId);
  const candidates = [];
  const seen = [];
  for (const p of json?.data || []) {
    const iba = p?.instagram_business_account;
    seen.push({
      page_id: String(p?.id || ''),
      page_name: p?.name || null,
      ig_username: iba?.username ? String(iba.username) : null,
      primary: Boolean(primaryId && iba?.id && String(iba.id) === primaryId)
    });
    if (!iba?.id || !p?.access_token) continue;
    if (primaryId && String(iba.id) === primaryId) continue;
    candidates.push({
      page_id: String(p.id),
      page_name: p.name || null,
      page_token: String(p.access_token),
      ig_user_id: String(iba.id),
      ig_username: iba.username ? String(iba.username) : null
    });
  }
  return { ok: true, candidates, seen, primary_ig_user_id: primaryId || null };
}

/**
 * Ek hesabı doğrular, webhook'a abone eder ve tabloya yazar (panel POST ile aynı kurallar).
 * @returns {{ ok: boolean, item?: object, error?: string, message?: string, subscription?: object }}
 */
export async function saveExtraInstagramAccount({ institutionId, pageId, pageToken, createdBy }) {
  const check = await verifyPageInstagramAccount({ pageId, token: pageToken });
  if (!check.ok) return { ok: false, error: 'verify_failed', message: check.error };
  const primaryId = await primaryInstagramIgUserId(institutionId);
  if (primaryId && primaryId === check.ig_user_id) {
    return { ok: false, error: 'primary_account', message: 'Bu hesap zaten ana Instagram hesabı.' };
  }
  const existing = await getInstagramAccountRow(check.ig_user_id);
  if (existing && !sameInstitution(existing.institution_id, institutionId)) {
    return { ok: false, error: 'account_taken', message: 'Bu Instagram hesabı başka bir kuruma bağlı.' };
  }
  const subscription = await subscribePageToApp({ pageId, token: pageToken });
  const now = new Date().toISOString();
  const row = {
    institution_id: storedInstitutionId(institutionId),
    ig_user_id: check.ig_user_id,
    ig_username: check.ig_username,
    page_id: String(pageId),
    page_token: String(pageToken),
    is_active: true,
    last_verified_at: now,
    last_verify_error: subscription.ok ? null : `Webhook aboneliği: ${String(subscription.error || '').slice(0, 300)}`,
    updated_at: now
  };
  if (!existing) row.created_by = createdBy || null;
  const { data, error } = await supabaseAdmin
    .from(INSTAGRAM_ACCOUNTS_TABLE)
    .upsert(row, { onConflict: 'ig_user_id' })
    .select('*')
    .maybeSingle();
  if (error) return { ok: false, error: 'db_error', message: error.message };
  clearInstagramAccountCaches();
  return { ok: true, item: publicAccountRow(data), page_name: check.page_name || null, subscription };
}
