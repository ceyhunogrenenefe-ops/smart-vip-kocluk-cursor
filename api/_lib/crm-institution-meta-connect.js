/**
 * Kurum (platform dışı) Meta bağlantısını tek tıkla kurar.
 *
 * Eskiden kurumlar anahtar / kimlikleri Meta iş yöneticisinden elle kopyalıyordu.
 * Burada ana hesabın kullandığı akışların kurum sürümü var:
 *   - Instagram: Facebook ile giriş → kurumun sayfası + Instagram'ı → sayfa
 *     anahtarı crm_meta_connections'a yazılır, sayfa webhook'a abone edilir.
 *   - WhatsApp: Embedded Signup (WhatsApp Business uygulamasıyla birlikte
 *     kullanım) → işletme anahtarı + numara kimliği crm_meta_connections'a
 *     yazılır, WABA ve numara production webhook'una bağlanır.
 *
 * Platform kurumunun genel ayarlarına (commerce_settings) ASLA dokunmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import {
  isPlatformInstitutionId,
  saveInstitutionMetaConnection
} from './crm-meta-connection.js';

const graphVersion = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
const graphUrl = (path) => `https://graph.facebook.com/${graphVersion()}/${path}`;

export const INST_IG_PENDING_KEY = 'inst_ig_pending';
const PRODUCTION_WEBHOOK_URL = 'https://www.dersonlinevipkocluk.com/api/meta/webhook';

function graphErr(json, fallback) {
  const msg = json?.error?.message || json?.message;
  return msg ? String(msg) : fallback;
}

async function graphCall(path, token, { method = 'GET', body = null } = {}) {
  try {
    const res = await fetch(graphUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && !json?.error, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { error: { message: errorMessage(e) } } };
  }
}

function requireInstitution(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id || isPlatformInstitutionId(id)) {
    throw new Error('Bu bağlantı kurumlar içindir; ana hesap kendi ekranından bağlanır.');
  }
  return id;
}

/** Bu Instagram hesabı başka yerde (ana hesap, ek hesap, başka kurum) kullanılıyor mu? */
async function instagramTakenBy(igUserId, institutionId) {
  const ig = String(igUserId || '').trim();
  try {
    const { primaryInstagramIgUserId } = await import('./crm-instagram-accounts.js');
    const primary = await primaryInstagramIgUserId(null);
    if (primary && primary === ig) return 'ana hesap (Online Vip)';
  } catch {
    /* yok say */
  }
  try {
    const { data } = await supabaseAdmin
      .from('crm_instagram_accounts')
      .select('ig_username')
      .eq('ig_user_id', ig)
      .limit(1);
    if (data?.length) return 'ana hesabın ek Instagram hesabı';
  } catch {
    /* tablo yoksa yok say */
  }
  try {
    const { data } = await supabaseAdmin
      .from('crm_meta_connections')
      .select('institution_id')
      .eq('ig_user_id', ig)
      .neq('institution_id', institutionId)
      .limit(1);
    if (data?.length) return 'başka bir kurum';
  } catch {
    /* yok say */
  }
  return null;
}

/** Facebook kullanıcı anahtarıyla yönetilen, Instagram'ı bağlı sayfalar. */
export async function listInstitutionInstagramCandidates(userToken, institutionId) {
  const inst = requireInstitution(institutionId);
  const r = await graphCall(
    `me/accounts?fields=${encodeURIComponent('id,name,access_token,instagram_business_account{id,username}')}&limit=50`,
    userToken
  );
  if (!r.ok) return { ok: false, error: graphErr(r.json, `HTTP ${r.status}`), candidates: [], seen: [] };
  const candidates = [];
  const seen = [];
  for (const p of r.json?.data || []) {
    const iba = p?.instagram_business_account;
    const taken = iba?.id ? await instagramTakenBy(iba.id, inst) : null;
    seen.push({
      page_name: p?.name || String(p?.id || ''),
      ig_username: iba?.username ? String(iba.username) : null,
      taken
    });
    if (!iba?.id || !p?.access_token || taken) continue;
    candidates.push({
      page_id: String(p.id),
      page_name: p.name || null,
      page_token: String(p.access_token),
      ig_user_id: String(iba.id),
      ig_username: iba.username ? String(iba.username) : null
    });
  }
  return { ok: true, candidates, seen };
}

/** Seçilen sayfayı kuruma yazar ve webhook'a abone eder. */
export async function saveInstitutionInstagram({ institutionId, candidate, actorId }) {
  const inst = requireInstitution(institutionId);
  const c = candidate || {};
  const taken = await instagramTakenBy(c.ig_user_id, inst);
  if (taken) return { ok: false, error: 'account_taken', message: `Bu Instagram hesabı ${taken} olarak kullanılıyor.` };

  const { subscribePageToApp } = await import('./crm-instagram-accounts.js');
  const sub = await subscribePageToApp({ pageId: c.page_id, token: c.page_token });

  await saveInstitutionMetaConnection(
    inst,
    {
      ig_page_token: c.page_token,
      ig_page_id: c.page_id,
      ig_user_id: c.ig_user_id,
      ig_username: c.ig_username || '',
      is_active: true
    },
    actorId
  );
  await markVerified(inst, sub.ok ? null : `Instagram webhook aboneliği: ${sub.error || 'başarısız'}`);
  return { ok: true, ig_username: c.ig_username || null, page_name: c.page_name || null, subscription_ok: sub.ok };
}

async function markVerified(institutionId, error) {
  try {
    await supabaseAdmin
      .from('crm_meta_connections')
      .update({
        last_verified_at: error ? null : new Date().toISOString(),
        last_verify_error: error ? String(error).slice(0, 400) : null
      })
      .eq('institution_id', institutionId);
  } catch {
    /* sessiz */
  }
}

/* ---------- Instagram: birden fazla sayfa → panelden seçim ---------- */

async function readGlobalSettings() {
  const { data } = await supabaseAdmin
    .from('commerce_settings')
    .select('id, meta')
    .is('institution_id', null)
    .maybeSingle();
  return { id: data?.id || null, meta: data?.meta && typeof data.meta === 'object' ? data.meta : {} };
}

/** Bekleyen seçimler kurum başına tutulur (anahtarlar yalnız sunucuda, 15 dk). */
export async function storeInstagramPending(institutionId, candidates, actorId) {
  const inst = requireInstitution(institutionId);
  const row = await readGlobalSettings();
  if (!row.id) throw new Error('settings_missing');
  const all = row.meta[INST_IG_PENDING_KEY] && typeof row.meta[INST_IG_PENDING_KEY] === 'object' ? row.meta[INST_IG_PENDING_KEY] : {};
  const now = Date.now();
  const kept = Object.fromEntries(Object.entries(all).filter(([, v]) => Date.parse(v?.expires_at || 0) > now));
  kept[inst] = { created_by: actorId || null, expires_at: new Date(now + 15 * 60 * 1000).toISOString(), candidates };
  await supabaseAdmin
    .from('commerce_settings')
    .update({ meta: { ...row.meta, [INST_IG_PENDING_KEY]: kept } })
    .eq('id', row.id);
}

export async function readInstagramPending(institutionId) {
  const inst = requireInstitution(institutionId);
  const row = await readGlobalSettings();
  const p = row.meta?.[INST_IG_PENDING_KEY]?.[inst];
  if (!p || Date.parse(p.expires_at || 0) <= Date.now()) return [];
  return Array.isArray(p.candidates) ? p.candidates : [];
}

export async function clearInstagramPending(institutionId) {
  const inst = requireInstitution(institutionId);
  const row = await readGlobalSettings();
  if (!row.id) return;
  const all = { ...(row.meta?.[INST_IG_PENDING_KEY] || {}) };
  delete all[inst];
  await supabaseAdmin
    .from('commerce_settings')
    .update({ meta: { ...row.meta, [INST_IG_PENDING_KEY]: all } })
    .eq('id', row.id);
}

/* ---------- WhatsApp: Embedded Signup (birlikte kullanım) ---------- */

/** Bu numara ana hesapta ya da başka kurumda mı? */
async function phoneTakenBy(phoneNumberId, institutionId) {
  const pid = String(phoneNumberId || '').trim();
  try {
    const { loadMetaWhatsAppSecretsFromDb } = await import('./meta-whatsapp.js');
    await loadMetaWhatsAppSecretsFromDb();
  } catch {
    /* env yeterli */
  }
  if (pid && pid === String(process.env.META_PHONE_NUMBER_ID || '').trim()) return 'ana hesap (Online Vip)';
  try {
    const { data } = await supabaseAdmin
      .from('crm_meta_connections')
      .select('institution_id')
      .eq('wa_phone_number_id', pid)
      .neq('institution_id', institutionId)
      .limit(1);
    if (data?.length) return 'başka bir kurum';
  } catch {
    /* yok say */
  }
  return null;
}

function webhookVerifyToken() {
  return String(
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_VERIFY_TOKEN ||
      process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      ''
  ).trim();
}

/**
 * @param {{ institutionId: string, code: string, waba_id?: string, phone_number_id?: string, actorId?: string }} input
 */
export async function completeInstitutionWhatsApp(input = {}) {
  /** @type {{ step: string, ok: boolean, error?: string | null }[]} */
  const steps = [];
  const out = { ok: false, steps, display_phone: null, error: null };
  let inst;
  try {
    inst = requireInstitution(input.institutionId);
  } catch (e) {
    out.error = errorMessage(e);
    return out;
  }

  const { exchangeEmbeddedSignupCode } = await import('./meta-wa-coexistence.js');
  const ex = await exchangeEmbeddedSignupCode(input.code);
  steps.push({ step: 'code_exchange', ok: ex.ok, error: ex.ok ? null : ex.error });
  if (!ex.ok) {
    out.error = ex.error;
    return out;
  }
  const tok = ex.access_token;

  const wabaId = String(input.waba_id || '').trim();
  if (!wabaId) {
    steps.push({ step: 'session_info', ok: false, error: 'WhatsApp hesabı seçilmedi (waba_id gelmedi).' });
    out.error = 'waba_id_missing';
    return out;
  }
  steps.push({ step: 'session_info', ok: true });

  const listed = await graphCall(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type`,
    tok
  );
  const phones = Array.isArray(listed.json?.data) ? listed.json.data : [];
  let phoneId = String(input.phone_number_id || '').trim();
  let phone = phoneId ? phones.find((p) => String(p?.id) === phoneId) : null;
  if (!phone && phones.length === 1) {
    phone = phones[0];
    phoneId = String(phone.id);
  }
  if (!listed.ok || !phone) {
    const err = listed.ok ? 'Seçilen numara WhatsApp hesabında bulunamadı.' : graphErr(listed.json, 'phone_lookup_failed');
    steps.push({ step: 'phone_lookup', ok: false, error: err });
    out.error = err;
    return out;
  }
  out.display_phone = phone.display_phone_number || null;
  steps.push({ step: 'phone_lookup', ok: true });

  const taken = await phoneTakenBy(phoneId, inst);
  if (taken) {
    const err = `Bu numara ${taken} tarafından kullanılıyor.`;
    steps.push({ step: 'save_settings', ok: false, error: err });
    out.error = err;
    return out;
  }

  try {
    await saveInstitutionMetaConnection(
      inst,
      {
        wa_token: tok,
        wa_phone_number_id: phoneId,
        wa_waba_id: wabaId,
        wa_display_phone: phone.display_phone_number || '',
        is_active: true
      },
      input.actorId || null
    );
    steps.push({ step: 'save_settings', ok: true });
  } catch (e) {
    steps.push({ step: 'save_settings', ok: false, error: errorMessage(e) });
    out.error = errorMessage(e);
    return out;
  }

  // Gelen mesajlar: WABA'yı uygulamaya abone et + production webhook'una yönlendir
  const verify = webhookVerifyToken();
  const sub = await graphCall(`${encodeURIComponent(wabaId)}/subscribed_apps`, tok, { method: 'POST' });
  let bindOk = sub.ok;
  let bindErr = sub.ok ? null : graphErr(sub.json, 'subscribe_failed');
  if (sub.ok && verify) {
    const ov = await graphCall(`${encodeURIComponent(wabaId)}/subscribed_apps`, tok, {
      method: 'POST',
      body: { override_callback_uri: PRODUCTION_WEBHOOK_URL, verify_token: verify }
    });
    if (!ov.ok) {
      bindOk = false;
      bindErr = graphErr(ov.json, 'override_failed');
    }
  }
  steps.push({ step: 'webhook_bind', ok: bindOk, error: bindErr });

  // Birlikte kullanım: telefondaki rehber + geçmiş (hata kurulumu bozmaz)
  for (const syncType of ['smb_app_state_sync', 'history']) {
    const r = await graphCall(`${encodeURIComponent(phoneId)}/smb_app_data`, tok, {
      method: 'POST',
      body: { messaging_product: 'whatsapp', sync_type: syncType }
    });
    steps.push({ step: `sync_${syncType}`, ok: r.ok, error: r.ok ? null : graphErr(r.json, `http_${r.status}`) });
  }

  await markVerified(inst, bindOk ? null : `WhatsApp webhook: ${bindErr}`);
  out.ok = steps.every((s) => s.ok || s.step.startsWith('sync_'));
  if (!out.ok && !out.error) out.error = steps.find((s) => !s.ok && !s.step.startsWith('sync_'))?.error || 'failed';
  return out;
}

/**
 * Bağlantının yazılacağı kurum — CRM gelen kutusuyla aynı kural:
 * yönetici / süper yönetici panelde seçtiği kurumu gönderebilir; diğerleri
 * kendi kurumunu kullanır.
 */
export async function resolveTargetInstitution(actor, roleSet, requested) {
  const q = String(requested || '').trim();
  if (q && roleSet && (roleSet.has('super_admin') || roleSet.has('admin'))) return q;
  if (actor?.institution_id) return String(actor.institution_id);
  try {
    const { data } = await supabaseAdmin.from('users').select('institution_id').eq('id', actor?.sub).maybeSingle();
    return data?.institution_id ? String(data.institution_id) : null;
  } catch {
    return null;
  }
}
