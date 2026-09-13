/**
 * Meta Cloud API → CRM inbound bağlama.
 *
 * Gerçek müşteri mesajı (kişisel WhatsApp → 0850 Cloud API) yalnızca
 * WABA uygulaması subscribed + callback URL production webhook ise gelir.
 * BM’ye girmeden Graph ile:
 *   1) POST /{WABA}/subscribed_apps          (uygulamayı abone et)
 *   2) POST /{WABA}/subscribed_apps + override_callback_uri
 *   3) POST /{PHONE_NUMBER_ID} webhook_configuration override
 */
import {
  getMetaWebhookEnvStatus,
  loadMetaWhatsAppSecretsFromDb
} from './meta-whatsapp.js';
import { resolvePrimaryWabaId } from './meta-templates-sync.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

export const PRODUCTION_WEBHOOK_URL = 'https://www.dersonlinevipkocluk.com/api/meta/webhook';
export const COMPANY_WA_DISPLAY = '0850 303 40 14';
export const COMPANY_WA_DIGITS = '908503034014';

function token() {
  return String(process.env.META_WHATSAPP_TOKEN || '').trim();
}

function phoneNumberId() {
  return String(process.env.META_PHONE_NUMBER_ID || '').trim();
}

function verifyToken() {
  return String(
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_VERIFY_TOKEN ||
      process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      ''
  ).trim();
}

export function isOurWebhookCallback(url) {
  const s = String(url || '').trim().toLowerCase();
  if (!s) return false;
  const ours =
    s.includes('dersonlinevipkocluk.com') &&
    (s.includes('/api/meta/webhook') || s.includes('/api/webhooks/meta'));
  return ours;
}

async function graphGet(path, tok) {
  const url = path.startsWith('http') ? path : `https://graph.facebook.com/${GRAPH()}/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function graphPost(path, tok, body) {
  const url = `https://graph.facebook.com/${GRAPH()}/${path}`;
  const headers = { Authorization: `Bearer ${tok}` };
  /** @type {RequestInit} */
  const init = { method: 'POST', headers };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function graphErr(json, fallback) {
  const msg = json?.error?.message || json?.message;
  return msg ? String(msg) : fallback;
}

function maskId(id) {
  const s = String(id || '');
  if (s.length <= 6) return s || null;
  return s.slice(-6);
}

function subscribedRows(json) {
  return Array.isArray(json?.data) ? json.data : [];
}

function subscribedAppName(row) {
  const d = row?.whatsapp_business_api_data && typeof row.whatsapp_business_api_data === 'object'
    ? row.whatsapp_business_api_data
    : {};
  return String(d.name || row?.name || '').trim() || null;
}

function subscribedAppId(row) {
  const d = row?.whatsapp_business_api_data && typeof row.whatsapp_business_api_data === 'object'
    ? row.whatsapp_business_api_data
    : {};
  return String(d.id || row?.id || '').trim() || null;
}

export function summarizeInboundBind({
  phoneWebhook = null,
  subscribed = [],
  displayPhone = null,
  appName = null,
  appIdSuffix = null,
  tokenValid = null
} = {}) {
  const cfg = phoneWebhook && typeof phoneWebhook === 'object' ? phoneWebhook : {};
  const phoneCb = cfg.phone_number || null;
  const wabaCb = cfg.whatsapp_business_account || null;
  const appCb = cfg.application || null;
  const effective = phoneCb || wabaCb || appCb || null;
  const subscribedOk = subscribed.length > 0;
  const bound = Boolean(effective && isOurWebhookCallback(effective) && subscribedOk);
  const display =
    displayPhone ||
    (String(displayPhone || '').includes('850') ? displayPhone : COMPANY_WA_DISPLAY);

  let hint;
  if (!tokenValid) {
    hint = 'META_WHATSAPP_TOKEN geçersiz — Graph inbound bağlanamadı.';
  } else if (!subscribedOk) {
    hint =
      'WABA uygulaması subscribed_apps’te yok — gerçek müşteri mesajı Meta tarafından iletilmez. Otomatik abone ediliyor.';
  } else if (!effective) {
    hint =
      'Webhook callback boş — uygulama / WABA / numara override production URL’ye bağlanacak.';
  } else if (!isOurWebhookCallback(effective)) {
    hint = `Meta şu an mesajları başka URL’ye atıyor (${String(effective).slice(0, 80)}) — production webhook’a override edilecek.`;
  } else if (bound) {
    hint = `Kurumsal hat ${display} production webhook’a bağlı. Kişisel WhatsApp’tan bu numaraya yazın (QR/koç hattı değil).`;
  } else {
    hint = 'Webhook kısmen bağlı — override yenilenecek.';
  }

  return {
    bound_to_production: bound,
    subscribed_app_count: subscribed.length,
    subscribed_app_name: appName || subscribedAppName(subscribed[0]) || null,
    app_id_suffix: appIdSuffix,
    display_phone: display,
    company_line: COMPANY_WA_DISPLAY,
    company_digits: COMPANY_WA_DIGITS,
    webhook_url: PRODUCTION_WEBHOOK_URL,
    callbacks: {
      phone_number: phoneCb,
      waba: wabaCb,
      application: appCb,
      effective,
      effective_is_ours: isOurWebhookCallback(effective)
    },
    hint
  };
}

let inspectCache = { at: 0, value: null };
const INSPECT_TTL_MS = 45_000;

/**
 * Graph’tan mevcut inbound durumunu oku / isteğe bağlı bağla.
 * @param {{ apply?: boolean }} [opts]
 */
export async function ensureMetaInboundDelivery({ apply = false } = {}) {
  if (!apply && inspectCache.value && Date.now() - inspectCache.at < INSPECT_TTL_MS) {
    return inspectCache.value;
  }
  await loadMetaWhatsAppSecretsFromDb();
  const tok = token();
  const pid = phoneNumberId();
  const verify = verifyToken();
  const webhook = getMetaWebhookEnvStatus();

  /** @type {Record<string, unknown>} */
  const out = {
    ok: false,
    applied: false,
    token_present: Boolean(tok),
    verify_token_present: Boolean(verify),
    phone_number_id_suffix: maskId(pid),
    waba_id_suffix: null,
    waba_source: null,
    display_phone: null,
    verified_name: null,
    quality_rating: null,
    token_app_name: null,
    token_app_id_suffix: null,
    token_valid: null,
    token_scopes: [],
    subscribed_apps: [],
    phone_webhook: null,
    steps: [],
    summary: null,
    webhook,
    error: null
  };

  if (!tok || !pid) {
    out.error = 'meta_not_configured';
    out.summary = summarizeInboundBind({ tokenValid: false });
    out.summary.hint = 'META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID eksik.';
    return out;
  }

  try {
    const dbg = await graphGet(
      `debug_token?input_token=${encodeURIComponent(tok)}&access_token=${encodeURIComponent(tok)}`,
      tok
    );
    const data = dbg.json?.data || {};
    out.token_valid = dbg.ok ? data.is_valid !== false : false;
    out.token_app_name = data.application ? String(data.application) : null;
    out.token_app_id_suffix = maskId(data.app_id);
    out.token_scopes = Array.isArray(data.scopes) ? data.scopes : [];
    if (!dbg.ok) {
      out.steps.push({
        step: 'debug_token',
        ok: false,
        error: graphErr(dbg.json, `http_${dbg.status}`)
      });
    } else {
      out.steps.push({ step: 'debug_token', ok: true, app: out.token_app_name });
    }
  } catch (e) {
    out.steps.push({
      step: 'debug_token',
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    });
  }

  const primary = await resolvePrimaryWabaId(tok);
  const waba = primary.waba_id ? String(primary.waba_id) : '';
  out.waba_id_suffix = maskId(waba);
  out.waba_source = primary.source;
  if (!waba) {
    out.error = 'waba_unresolved';
    out.summary = summarizeInboundBind({ tokenValid: out.token_valid });
    out.summary.hint = 'WABA kimliği çözülemedi — META_WABA_ID / phone lookup başarısız.';
    return out;
  }

  const phoneFields =
    'id,display_phone_number,verified_name,quality_rating,code_verification_status,webhook_configuration';
  const phoneRes = await graphGet(
    `${encodeURIComponent(pid)}?fields=${encodeURIComponent(phoneFields)}`,
    tok
  );
  if (phoneRes.ok) {
    out.display_phone = phoneRes.json?.display_phone_number || null;
    out.verified_name = phoneRes.json?.verified_name || null;
    out.quality_rating = phoneRes.json?.quality_rating || null;
    out.phone_webhook = phoneRes.json?.webhook_configuration || null;
    out.steps.push({
      step: 'phone_lookup',
      ok: true,
      display: out.display_phone
    });
  } else {
    out.steps.push({
      step: 'phone_lookup',
      ok: false,
      error: graphErr(phoneRes.json, `http_${phoneRes.status}`)
    });
  }

  const subRes = await graphGet(`${encodeURIComponent(waba)}/subscribed_apps`, tok);
  if (subRes.ok) {
    out.subscribed_apps = subscribedRows(subRes.json).map((row) => ({
      app_name: subscribedAppName(row),
      app_id_suffix: maskId(subscribedAppId(row)),
      override_callback_uri: row.override_callback_uri || null,
      override_is_ours: isOurWebhookCallback(row.override_callback_uri)
    }));
    out.steps.push({
      step: 'subscribed_apps',
      ok: true,
      count: out.subscribed_apps.length
    });
  } else {
    out.steps.push({
      step: 'subscribed_apps',
      ok: false,
      error: graphErr(subRes.json, `http_${subRes.status}`)
    });
  }

  out.summary = summarizeInboundBind({
    phoneWebhook: out.phone_webhook,
    subscribed: out.subscribed_apps,
    displayPhone: out.display_phone,
    appName: out.token_app_name || out.subscribed_apps[0]?.app_name || null,
    appIdSuffix: out.token_app_id_suffix,
    tokenValid: out.token_valid !== false
  });

  // apply=true her zaman override yeniler — Meta production URL’yi tekrar doğrular.
  const doApply = Boolean(apply) && Boolean(verify);

  if (doApply) {
    out.applied = true;
    const alreadySubscribed = out.subscribed_apps.length > 0;
    if (!alreadySubscribed) {
      const sub = await graphPost(`${encodeURIComponent(waba)}/subscribed_apps`, tok, null);
      out.steps.push({
        step: 'subscribe_app',
        ok: sub.ok,
        error: sub.ok ? null : graphErr(sub.json, `http_${sub.status}`)
      });
    } else {
      out.steps.push({ step: 'subscribe_app', ok: true, skipped: 'already_subscribed' });
    }

    const ov = await graphPost(`${encodeURIComponent(waba)}/subscribed_apps`, tok, {
      override_callback_uri: PRODUCTION_WEBHOOK_URL,
      verify_token: verify
    });
    out.steps.push({
      step: 'waba_override_callback',
      ok: ov.ok,
      error: ov.ok ? null : graphErr(ov.json, `http_${ov.status}`)
    });

    const ph = await graphPost(encodeURIComponent(pid), tok, {
      webhook_configuration: {
        override_callback_uri: PRODUCTION_WEBHOOK_URL,
        verify_token: verify
      }
    });
    out.steps.push({
      step: 'phone_override_callback',
      ok: ph.ok,
      error: ph.ok ? null : graphErr(ph.json, `http_${ph.status}`)
    });

    const phone2 = await graphGet(
      `${encodeURIComponent(pid)}?fields=webhook_configuration,display_phone_number,verified_name`,
      tok
    );
    if (phone2.ok) {
      out.phone_webhook = phone2.json?.webhook_configuration || out.phone_webhook;
      out.display_phone = phone2.json?.display_phone_number || out.display_phone;
      out.verified_name = phone2.json?.verified_name || out.verified_name;
    }

    const sub2 = await graphGet(`${encodeURIComponent(waba)}/subscribed_apps`, tok);
    if (sub2.ok) {
      out.subscribed_apps = subscribedRows(sub2.json).map((row) => ({
        app_name: subscribedAppName(row),
        app_id_suffix: maskId(subscribedAppId(row)),
        override_callback_uri: row.override_callback_uri || null,
        override_is_ours: isOurWebhookCallback(row.override_callback_uri)
      }));
    }

    out.summary = summarizeInboundBind({
      phoneWebhook: out.phone_webhook,
      subscribed: out.subscribed_apps,
      displayPhone: out.display_phone,
      appName: out.token_app_name || out.subscribed_apps[0]?.app_name || null,
      appIdSuffix: out.token_app_id_suffix,
      tokenValid: out.token_valid !== false
    });
  } else if (apply && !verify) {
    out.steps.push({
      step: 'apply_skipped',
      ok: false,
      error: 'META_WEBHOOK_VERIFY_TOKEN yok — override doğrulanamaz.'
    });
  }

  const applyFailed = (out.steps || []).some(
    (s) =>
      s &&
      (s.step === 'waba_override_callback' ||
        s.step === 'phone_override_callback' ||
        s.step === 'subscribe_app') &&
      s.ok === false &&
      !s.skipped
  );
  out.ok = Boolean(out.summary?.bound_to_production) && !applyFailed;
  if (!out.ok && !out.error) {
    out.error = applyFailed ? 'graph_apply_failed' : 'not_bound_yet';
  }
  inspectCache = { at: Date.now(), value: out };
  return out;
}

/** CRM / sağlık ekranı için sırları içermeyen özet. */
export function publicInboundStatus(full) {
  const s = full?.summary || {};
  return {
    ok: Boolean(full?.ok),
    bound_to_production: Boolean(s.bound_to_production),
    company_line: s.company_line || COMPANY_WA_DISPLAY,
    company_digits: s.company_digits || COMPANY_WA_DIGITS,
    display_phone: full?.display_phone || s.display_phone || null,
    verified_name: full?.verified_name || null,
    webhook_url: PRODUCTION_WEBHOOK_URL,
    subscribed_app_name: s.subscribed_app_name || null,
    hint: s.hint || null,
    applied: Boolean(full?.applied),
    callbacks_ours: Boolean(s.callbacks?.effective_is_ours)
  };
}
