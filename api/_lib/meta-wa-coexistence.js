/**
 * WhatsApp Business uygulaması + Cloud API birlikte kullanım (coexistence) kurulumu.
 *
 * Akış (Meta Embedded Signup, featureType=whatsapp_business_app_onboarding):
 *   1) Tarayıcıda FB.login({ config_id, response_type: 'code', extras }) → code
 *      + window.message (WA_EMBEDDED_SIGNUP) → waba_id, phone_number_id
 *   2) Sunucu: code → işletme token’ı (redirect_uri YOK — JS SDK popup akışı)
 *   3) Token ile WABA’daki numarayı doğrula
 *   4) commerce_settings.meta.whatsapp güncelle (eski ayar whatsapp_prev’e yedeklenir)
 *   5) ensureMetaInboundDelivery → uygulama aboneliği + webhook override
 *   6) Telefondaki rehber ve sohbet geçmişini senkronla (onboarding sonrası 24 saat içinde)
 *
 * Numara telefondaki WhatsApp Business uygulamasında çalışmaya devam eder;
 * /register çağrılmaz (coexistence numarası zaten kayıtlıdır).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb, saveMetaWhatsAppSecretsToDb } from './meta-whatsapp.js';
import {
  metaFacebookAppId,
  metaFacebookAppSecret,
  metaFacebookGraphVersion
} from './meta-facebook-login.js';
import { ensureMetaInboundDelivery, publicInboundStatus } from './meta-inbound-ensure.js';

export const COEXISTENCE_FEATURE_TYPE = 'whatsapp_business_app_onboarding';

const graphUrl = (path) => `https://graph.facebook.com/${metaFacebookGraphVersion()}/${path}`;

function maskId(id) {
  const s = String(id || '');
  return s.length > 6 ? s.slice(-6) : s || null;
}

function graphErr(json, fallback) {
  const msg = json?.error?.message || json?.message;
  return msg ? String(msg) : fallback;
}

async function readGlobalMeta() {
  const { data, error } = await supabaseAdmin
    .from('commerce_settings')
    .select('id, meta')
    .is('institution_id', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('commerce_settings_global_missing');
  return { id: data.id, meta: data.meta && typeof data.meta === 'object' ? data.meta : {} };
}

async function patchGlobalMeta(key, value) {
  const row = await readGlobalMeta();
  const meta = { ...row.meta, [key]: value };
  const { error } = await supabaseAdmin
    .from('commerce_settings')
    .update({ meta, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw new Error(error.message);
  return meta;
}

/** Embedded Signup yapılandırma kimliği: env > panelde kaydedilen. */
export async function coexistenceConfigId() {
  const env = String(process.env.META_WA_ES_CONFIG_ID || '').trim();
  if (env) return { config_id: env, source: 'env' };
  try {
    const { meta } = await readGlobalMeta();
    const saved = String(meta?.whatsapp_es?.config_id || '').trim();
    if (saved) return { config_id: saved, source: 'panel' };
  } catch {
    /* tablo okunamazsa boş döner */
  }
  return { config_id: '', source: null };
}

export async function saveCoexistenceConfigId(configId) {
  const id = String(configId || '').trim();
  if (!/^\d{6,25}$/.test(id)) throw new Error('config_id_invalid');
  const { meta } = await readGlobalMeta();
  const prev = meta.whatsapp_es && typeof meta.whatsapp_es === 'object' ? meta.whatsapp_es : {};
  await patchGlobalMeta('whatsapp_es', { ...prev, config_id: id, updated_at: new Date().toISOString() });
  return id;
}

/** Panel için sır içermeyen durum. */
export async function describeCoexistenceSetup() {
  await loadMetaWhatsAppSecretsFromDb();
  const cfg = await coexistenceConfigId();
  let last = null;
  try {
    const { meta } = await readGlobalMeta();
    last = meta?.whatsapp_es?.last_onboarding || null;
  } catch {
    last = null;
  }
  return {
    app_id: metaFacebookAppId(),
    graph_version: metaFacebookGraphVersion(),
    config_id: cfg.config_id,
    config_source: cfg.source,
    has_app_secret: Boolean(metaFacebookAppSecret()),
    feature_type: COEXISTENCE_FEATURE_TYPE,
    ready: Boolean(cfg.config_id && metaFacebookAppSecret()),
    current_phone_number_id_suffix: maskId(process.env.META_PHONE_NUMBER_ID),
    current_waba_id_suffix: maskId(process.env.META_WABA_ID),
    last_onboarding: last
  };
}

/** JS SDK (popup) kodu → işletme token’ı. redirect_uri gönderilmez. */
export async function exchangeEmbeddedSignupCode(code) {
  const id = metaFacebookAppId();
  const secret = metaFacebookAppSecret();
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, error: 'code_missing' };
  if (!id || !secret) return { ok: false, error: 'app_secret_missing' };
  const qs = new URLSearchParams({ client_id: id, client_secret: secret, code: trimmed });
  const res = await fetch(graphUrl(`oauth/access_token?${qs}`));
  const json = await res.json().catch(() => ({}));
  const token = String(json?.access_token || '').trim();
  if (!token) return { ok: false, error: graphErr(json, 'code_exchange_failed') };
  return { ok: true, access_token: token };
}

async function listWabaPhones(wabaId, tok) {
  const fields = 'id,display_phone_number,verified_name,platform_type,status';
  const res = await fetch(graphUrl(`${encodeURIComponent(wabaId)}/phone_numbers?fields=${fields}`), {
    headers: { Authorization: `Bearer ${tok}` }
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, phones: Array.isArray(json?.data) ? json.data : [], error: res.ok ? null : graphErr(json, `http_${res.status}`) };
}

async function smbAppSync(phoneNumberId, tok, syncType) {
  const res = await fetch(graphUrl(`${encodeURIComponent(phoneNumberId)}/smb_app_data`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType })
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, error: res.ok ? null : graphErr(json, `http_${res.status}`) };
}

/**
 * Embedded Signup sonucu CRM’e işlenir.
 * @param {{ code: string, waba_id?: string, phone_number_id?: string, event?: string }} input
 */
export async function completeCoexistenceOnboarding(input = {}) {
  /** @type {{ step: string, ok: boolean, error?: string | null, detail?: unknown }[]} */
  const steps = [];
  const out = { ok: false, steps, display_phone: null, waba_id_suffix: null, phone_number_id_suffix: null };

  await loadMetaWhatsAppSecretsFromDb();
  const previous = {
    phone_number_id: String(process.env.META_PHONE_NUMBER_ID || '').trim(),
    waba_id: String(process.env.META_WABA_ID || '').trim()
  };
  const existingToken = String(process.env.META_WHATSAPP_TOKEN || '').trim();

  const exchanged = await exchangeEmbeddedSignupCode(input.code);
  steps.push({ step: 'code_exchange', ok: exchanged.ok, error: exchanged.ok ? null : exchanged.error });
  if (!exchanged.ok) {
    out.error = exchanged.error;
    return out;
  }
  const businessToken = exchanged.access_token;

  const wabaId = String(input.waba_id || '').trim();
  let phoneId = String(input.phone_number_id || '').trim();
  if (!wabaId) {
    steps.push({ step: 'session_info', ok: false, error: 'waba_id_missing' });
    out.error = 'waba_id_missing';
    return out;
  }
  steps.push({ step: 'session_info', ok: true, detail: { event: input.event || null } });

  const listed = await listWabaPhones(wabaId, businessToken);
  if (!listed.ok) {
    steps.push({ step: 'phone_lookup', ok: false, error: listed.error });
    out.error = listed.error;
    return out;
  }
  let phone = phoneId ? listed.phones.find((p) => String(p?.id) === phoneId) : null;
  if (!phone && listed.phones.length === 1) {
    phone = listed.phones[0];
    phoneId = String(phone.id);
  }
  if (!phone) {
    steps.push({
      step: 'phone_lookup',
      ok: false,
      error: 'phone_not_in_waba',
      detail: listed.phones.map((p) => ({ id_suffix: maskId(p.id), display: p.display_phone_number || null }))
    });
    out.error = 'phone_not_in_waba';
    return out;
  }
  out.display_phone = phone.display_phone_number || null;
  out.waba_id_suffix = maskId(wabaId);
  out.phone_number_id_suffix = maskId(phoneId);
  steps.push({ step: 'phone_lookup', ok: true, detail: { display: out.display_phone, platform: phone.platform_type || null } });

  // Mevcut sistem kullanıcısı token’ı yeni WABA’ya erişebiliyorsa onu koru; yoksa işletme token’ını kullan.
  let tokenToSave = businessToken;
  let tokenSource = 'embedded_signup';
  if (existingToken) {
    const probe = await listWabaPhones(wabaId, existingToken);
    if (probe.ok && probe.phones.some((p) => String(p?.id) === phoneId)) {
      tokenToSave = existingToken;
      tokenSource = 'existing_system_user';
    }
  }
  steps.push({ step: 'token_choice', ok: true, detail: { source: tokenSource } });

  try {
    if (previous.phone_number_id && previous.phone_number_id !== phoneId) {
      const { meta } = await readGlobalMeta();
      await patchGlobalMeta('whatsapp_prev', {
        phone_number_id: previous.phone_number_id,
        waba_id: previous.waba_id || meta?.whatsapp?.waba_id || null,
        saved_at: new Date().toISOString()
      });
    }
    await saveMetaWhatsAppSecretsToDb({ token: tokenToSave, phone_number_id: phoneId, waba_id: wabaId });
    steps.push({ step: 'save_settings', ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push({ step: 'save_settings', ok: false, error: msg });
    out.error = msg;
    return out;
  }

  const inbound = await ensureMetaInboundDelivery({ apply: true }).catch((e) => ({
    ok: false,
    error: e instanceof Error ? e.message : String(e)
  }));
  const pub = publicInboundStatus(inbound);
  steps.push({
    step: 'webhook_bind',
    ok: Boolean(pub.bound_to_production),
    error: pub.bound_to_production ? null : String(inbound?.error || pub.hint || 'not_bound')
  });

  for (const syncType of ['smb_app_state_sync', 'history']) {
    const r = await smbAppSync(phoneId, tokenToSave, syncType);
    steps.push({ step: `sync_${syncType}`, ok: r.ok, error: r.error });
  }

  out.inbound = pub;
  out.ok = steps.every((s) => s.ok || s.step.startsWith('sync_'));

  try {
    const { meta } = await readGlobalMeta();
    const prev = meta.whatsapp_es && typeof meta.whatsapp_es === 'object' ? meta.whatsapp_es : {};
    await patchGlobalMeta('whatsapp_es', {
      ...prev,
      last_onboarding: {
        at: new Date().toISOString(),
        ok: out.ok,
        display_phone: out.display_phone,
        waba_id_suffix: out.waba_id_suffix,
        phone_number_id_suffix: out.phone_number_id_suffix,
        steps: steps.map((s) => ({ step: s.step, ok: s.ok, error: s.error || null }))
      }
    });
  } catch {
    /* kayıt düşmezse kurulum yine geçerli */
  }

  return out;
}
