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
