/**
 * Kurum başına Meta bağlantısı (WhatsApp Cloud API + Instagram).
 *
 * Platform kurumu eski genel ayarı (commerce_settings.meta + Vercel env) kullanır.
 * Diğer kurumlar `crm_meta_connections` satırını kullanır; satır yoksa bağlantı YOKTUR —
 * platformun hesabı asla başka kuruma görünmez/kullanılmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';
import { errorMessage } from './error-msg.js';

export function isPlatformInstitutionId(institutionId) {
  const id = String(institutionId || '').trim();
  return !id || id === PLATFORM_PRIMARY_INSTITUTION_ID;
}

/** Ekranda gösterim: gizli değerleri maskele */
export function maskSecret(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.length <= 8) return '•'.repeat(s.length);
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export async function getInstitutionMetaRow(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from('crm_meta_connections')
    .select('*')
    .eq('institution_id', id)
    .maybeSingle();
  if (error) {
    if (String(error.code) === '42P01') return null; // tablo yoksa bağlantı yok say
    throw error;
  }
  return data || null;
}

/** Platform genel ayarı (commerce_settings.meta) — yalnız platform kurumu için. */
async function loadPlatformMeta() {
  try {
    const { data } = await supabaseAdmin
      .from('commerce_settings')
      .select('meta')
      .is('institution_id', null)
      .maybeSingle();
    const meta = data?.meta && typeof data.meta === 'object' ? data.meta : {};
    const wa = meta.whatsapp && typeof meta.whatsapp === 'object' ? meta.whatsapp : {};
    const ig = meta.instagram && typeof meta.instagram === 'object' ? meta.instagram : {};
    const page = meta.page && typeof meta.page === 'object' ? meta.page : {};
    return {
      whatsapp: {
        token: String(wa.token || wa.access_token || process.env.META_WHATSAPP_TOKEN || '').trim(),
        phoneNumberId: String(wa.phone_number_id || process.env.META_PHONE_NUMBER_ID || '').trim(),
        wabaId: String(wa.waba_id || process.env.META_WABA_ID || '').trim(),
        displayPhone: String(wa.display_phone || '').trim()
      },
      instagram: {
        token: String(ig.token || ig.access_token || page.token || process.env.META_PAGE_TOKEN || '').trim(),
        pageId: String(ig.page_id || page.page_id || process.env.META_PAGE_ID || '').trim(),
        igUserId: String(
          ig.instagram_business_account_id || ig.ig_user_id || process.env.META_IG_BUSINESS_ID || ''
        ).trim(),
        username: String(ig.username || '').trim()
      }
    };
  } catch (e) {
    console.warn('[crm-meta-connection] platform meta load:', errorMessage(e));
    return { whatsapp: {}, instagram: {} };
  }
}

/**
 * Kurumun kullanacağı Meta ayarı.
 * @returns {Promise<{source:'platform'|'institution'|'none', whatsapp:object, instagram:object, row?:object|null}>}
 */
export async function resolveMetaConnection(institutionId) {
  if (isPlatformInstitutionId(institutionId)) {
    const platform = await loadPlatformMeta();
    return { source: 'platform', ...platform, row: null };
  }
  const row = await getInstitutionMetaRow(institutionId);
  if (!row || row.is_active === false) {
    return { source: 'none', whatsapp: {}, instagram: {}, row: row || null };
  }
  return {
    source: 'institution',
    whatsapp: {
      token: String(row.wa_token || '').trim(),
      phoneNumberId: String(row.wa_phone_number_id || '').trim(),
      wabaId: String(row.wa_waba_id || '').trim(),
      displayPhone: String(row.wa_display_phone || '').trim()
    },
    instagram: {
      token: String(row.ig_page_token || '').trim(),
      pageId: String(row.ig_page_id || '').trim(),
      igUserId: String(row.ig_user_id || '').trim(),
      username: String(row.ig_username || '').trim()
    },
    row
  };
}

/** Panelde gösterilecek bağlantı durumu (gizli değerler maskeli). */
export async function describeMetaConnection(institutionId) {
  const conn = await resolveMetaConnection(institutionId);
  const wa = conn.whatsapp || {};
  const ig = conn.instagram || {};
  return {
    source: conn.source,
    is_platform: isPlatformInstitutionId(institutionId),
    whatsapp: {
      connected: Boolean(wa.token && wa.phoneNumberId),
      phone_number_id: wa.phoneNumberId || null,
      waba_id: wa.wabaId || null,
      display_phone: wa.displayPhone || null,
      token_masked: maskSecret(wa.token)
    },
    instagram: {
      connected: Boolean(ig.token && ig.igUserId),
      ig_user_id: ig.igUserId || null,
      page_id: ig.pageId || null,
      username: ig.username || null,
      token_masked: maskSecret(ig.token)
    },
    last_verified_at: conn.row?.last_verified_at || null,
    last_verify_error: conn.row?.last_verify_error || null,
    updated_at: conn.row?.updated_at || null
  };
}

const FIELD_MAP = {
  wa_token: 'wa_token',
  wa_phone_number_id: 'wa_phone_number_id',
  wa_waba_id: 'wa_waba_id',
  wa_display_phone: 'wa_display_phone',
  ig_page_token: 'ig_page_token',
  ig_page_id: 'ig_page_id',
  ig_user_id: 'ig_user_id',
  ig_username: 'ig_username'
};

/** Kurum bağlantısını kaydeder (boş gönderilen alanlar değişmez, '' gönderilirse temizlenir). */
export async function saveInstitutionMetaConnection(institutionId, patch = {}, actorId = null) {
  const id = String(institutionId || '').trim();
  if (!id) throw new Error('institution_required');
  if (isPlatformInstitutionId(id)) throw new Error('platform_uses_global_settings');

  const row = { institution_id: id, updated_by: actorId ? String(actorId) : null, updated_at: new Date().toISOString() };
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    if (patch[key] === undefined) continue;
    const v = String(patch[key] ?? '').trim();
    row[col] = v || null;
  }
  if (patch.is_active !== undefined) row.is_active = Boolean(patch.is_active);

  const { error } = await supabaseAdmin
    .from('crm_meta_connections')
    .upsert(row, { onConflict: 'institution_id' });
  if (error) throw error;
  return describeMetaConnection(id);
}

/** Meta Graph API ile doğrulama: numara ve token gerçekten çalışıyor mu. */
export async function verifyInstitutionMetaConnection(institutionId) {
  const conn = await resolveMetaConnection(institutionId);
  const wa = conn.whatsapp || {};
  if (!wa.token || !wa.phoneNumberId) {
    return { ok: false, error: 'WhatsApp için erişim anahtarı ve numara kimliği gerekli.' };
  }
  const version = String(process.env.META_GRAPH_VERSION || 'v21.0').trim();
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(wa.phoneNumberId)}?fields=display_phone_number,verified_name`;
  let out = { ok: false, error: 'meta_error' };
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${wa.token}` },
      signal: AbortSignal.timeout(12000)
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.id) {
      out = {
        ok: true,
        display_phone_number: json.display_phone_number || null,
        verified_name: json.verified_name || null
      };
    } else {
      out = { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
  } catch (e) {
    out = { ok: false, error: errorMessage(e) };
  }

  if (!isPlatformInstitutionId(institutionId)) {
    try {
      await supabaseAdmin
        .from('crm_meta_connections')
        .update({
          last_verified_at: out.ok ? new Date().toISOString() : null,
          last_verify_error: out.ok ? null : String(out.error || '').slice(0, 400),
          wa_display_phone: out.ok && out.display_phone_number ? out.display_phone_number : undefined
        })
        .eq('institution_id', String(institutionId));
    } catch {
      /* doğrulama sonucu yazılamadıysa sessiz geç */
    }
  }
  return out;
}

/** Webhook yönlendirmesi: gelen numara / IG hesabı hangi kuruma ait? */
export async function findInstitutionByMetaIds({ phoneNumberId, igUserId } = {}) {
  const phone = String(phoneNumberId || '').trim();
  const ig = String(igUserId || '').trim();
  if (!phone && !ig) return null;
  try {
    let q = supabaseAdmin.from('crm_meta_connections').select('institution_id, wa_phone_number_id, ig_user_id').limit(1);
    q = phone ? q.eq('wa_phone_number_id', phone) : q.eq('ig_user_id', ig);
    const { data } = await q;
    const hit = (data || [])[0];
    return hit?.institution_id ? String(hit.institution_id) : null;
  } catch {
    return null;
  }
}
