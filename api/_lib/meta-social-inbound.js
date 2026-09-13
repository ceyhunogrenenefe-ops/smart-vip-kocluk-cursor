/**
 * Facebook Page + Instagram DM webhook bağlama (WhatsApp WABA bind’inin sosyal karşılığı).
 * Page token: META_PAGE_ACCESS_TOKEN / INSTAGRAM_PAGE_ACCESS_TOKEN / commerce_settings.meta.page
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
export const PRODUCTION_WEBHOOK_URL = 'https://www.dersonlinevipkocluk.com/api/meta/webhook';

export const DEFAULT_META_APP_ID = '1290015412657616';
/** Facebook Login for Business yapılandırma id — Page ID veya IG user id değildir. */
export const DEFAULT_META_CONFIGURATION_ID = '1784538625891317';

function looksLikeConfigurationId(id) {
  const s = String(id || '').trim();
  return s === DEFAULT_META_CONFIGURATION_ID || /^1784\d{12}$/.test(s);
}

const PAGE_FIELDS = [
  'messages',
  'messaging_postbacks',
  'messaging_optins',
  'message_echoes',
  'messaging_referrals',
  'standby'
].join(',');

/** WhatsApp WABA token asla kullanılmaz — IG/FB DM için ayrı Page/IG token gerekir. */
const SOCIAL_TOKEN_ENVS = [
  'INSTAGRAM_PAGE_ACCESS_TOKEN',
  'META_PAGE_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'INSTAGRAM_ACCESS_TOKEN',
  'META_INSTAGRAM_TOKEN',
  'IG_ACCESS_TOKEN',
  'PAGE_ACCESS_TOKEN'
];

export function resolveSocialToken() {
  for (const name of SOCIAL_TOKEN_ENVS) {
    const token = String(process.env[name] || '').trim();
    if (token) return { token, source: name };
  }
  return { token: '', source: null };
}

function pageToken() {
  return resolveSocialToken().token;
}

function pageIdEnv() {
  const raw = String(
    process.env.META_PAGE_ID || process.env.FACEBOOK_PAGE_ID || process.env.INSTAGRAM_PAGE_ID || ''
  ).trim();
  if (looksLikeConfigurationId(raw)) return '';
  return raw;
}

export function describeSocialTokenEnv() {
  const resolved = resolveSocialToken();
  const tok = resolved.token;
  return {
    token_present: Boolean(tok),
    token_source: resolved.source,
    token_suffix: tok ? tok.slice(-6) : null,
    env_flags: Object.fromEntries(SOCIAL_TOKEN_ENVS.map((name) => [name, Boolean(String(process.env[name] || '').trim())])),
    page_id_present: Boolean(pageIdEnv()),
    ig_business_id_present: Boolean(igBusinessIdEnv()),
    whatsapp_token_not_used: true
  };
}

function igBusinessIdEnv() {
  const raw = String(
    process.env.META_IG_BUSINESS_ID || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''
  ).trim();
  if (looksLikeConfigurationId(raw)) return '';
  return raw;
}

function appIdEnv() {
  return String(process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || DEFAULT_META_APP_ID).trim();
}

function appSecretEnv() {
  return String(process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim();
}

function verifyTokenEnv() {
  return String(
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_VERIFY_TOKEN ||
      process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      ''
  ).trim();
}

function configurationIdEnv() {
  return String(process.env.META_CONFIGURATION_ID || DEFAULT_META_CONFIGURATION_ID).trim();
}

async function graphGet(path, tok) {
  const url = path.startsWith('http') ? path : `https://graph.facebook.com/${GRAPH()}/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function graphPost(path, tok, body) {
  const url = `https://graph.facebook.com/${GRAPH()}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function graphFormPost(path, params) {
  const url = `https://graph.facebook.com/${GRAPH()}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function appAccessToken() {
  const id = appIdEnv();
  const secret = appSecretEnv();
  if (!id || !secret) return '';
  return `${id}|${secret}`;
}

function graphErr(json, fallback) {
  return json?.error?.message ? String(json.error.message) : fallback;
}

export async function saveMetaPageSecretsToDb(patch = {}) {
  const { data: row, error: readErr } = await supabaseAdmin
    .from('commerce_settings')
    .select('id, meta')
    .is('institution_id', null)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row?.id) throw new Error('commerce_settings_global_missing');
  const prevMeta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const prev = prevMeta.page && typeof prevMeta.page === 'object' ? prevMeta.page : {};
  const next = { ...prev };
  if (patch.token) next.token = String(patch.token).trim();
  if (patch.page_id) next.page_id = String(patch.page_id).trim();
  if (patch.instagram_business_account_id) {
    next.instagram_business_account_id = String(patch.instagram_business_account_id).trim();
  }
  if (patch.configuration_id) next.configuration_id = String(patch.configuration_id).trim();
  next.updated_at = new Date().toISOString();
  const { error: writeErr } = await supabaseAdmin
    .from('commerce_settings')
    .update({ meta: { ...prevMeta, page: next }, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (writeErr) throw new Error(writeErr.message);
  if (next.token) process.env.META_PAGE_ACCESS_TOKEN = next.token;
  if (next.page_id) process.env.META_PAGE_ID = next.page_id;
  return next;
}

const nameCache = new Map();

export async function lookupSocialProfileName(scopedId, tok = resolveSocialToken().token) {
  const id = String(scopedId || '').trim();
  if (!id || !tok) return null;
  const hit = nameCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.name;
  const { ok, json } = await graphGet(
    `${encodeURIComponent(id)}?fields=name,username`,
    tok
  );
  const name = ok ? String(json?.name || json?.username || '').trim() || null : null;
  nameCache.set(id, { at: Date.now(), name });
  return name;
}

export async function ensureMetaSocialInbound({ apply = false } = {}) {
  await loadMetaWhatsAppSecretsFromDb();
  const resolved = resolveSocialToken();
  const tok = resolved.token;
  /** @type {Record<string, unknown>} */
  const out = {
    ok: false,
    applied: false,
    token_present: Boolean(tok),
    token_source: resolved.source,
    token_kind: null,
    page_id: null,
    page_name: null,
    instagram_business_id: igBusinessIdEnv() || null,
    configuration_id: configurationIdEnv() || null,
    subscribed_fields: [],
    steps: [],
    hint: null,
    error: null
  };

  if (!tok) {
    out.error = 'page_token_missing';
    out.hint =
      'Vercel Production’da INSTAGRAM_PAGE_ACCESS_TOKEN veya META_PAGE_ACCESS_TOKEN olmalı. WhatsApp META_WHATSAPP_TOKEN IG/FB DM için kullanılmaz.';
    return out;
  }

  let pid = pageIdEnv();
  let useTok = tok;
  const me = await graphGet('me?fields=id,name', tok);
  const accountsRes = await graphGet(
    'me/accounts?fields=name,id,access_token,instagram_business_account&limit=25',
    tok
  );
  const accounts = accountsRes.ok && Array.isArray(accountsRes.json?.data) ? accountsRes.json.data : [];
  const igMe = await graphGet('me?fields=id,username,instagram_business_account', tok);

  if (me.ok) {
    const username = igMe.ok && igMe.json?.username ? String(igMe.json.username) : null;
    if (accounts.length) out.token_kind = 'user_with_pages';
    else if (username) out.token_kind = 'instagram';
    else out.token_kind = 'user_or_page';
    out.steps.push({
      step: 'token_identity',
      ok: true,
      kind: out.token_kind,
      name: me.json?.name || username || null,
      id_suffix: String(me.json?.id || '').slice(-6),
      accounts: accounts.length,
      source: resolved.source
    });
    if (accounts[0]?.id) {
      out.token_kind = 'user_with_pages';
      if (!pid) pid = String(accounts[0].id);
      if (accounts[0]?.access_token) {
        useTok = String(accounts[0].access_token);
        process.env.META_PAGE_ACCESS_TOKEN = useTok;
      }
      if (accounts[0]?.name) out.page_name = String(accounts[0].name);
      const ig = accounts[0]?.instagram_business_account?.id;
      if (ig && !looksLikeConfigurationId(ig)) {
        out.instagram_business_id = String(ig);
        process.env.META_IG_BUSINESS_ID = String(ig);
      }
    } else if (username && igMe.json?.id) {
      out.token_kind = 'instagram';
      out.instagram_business_id = String(igMe.json.id);
      process.env.META_IG_BUSINESS_ID = String(igMe.json.id);
      const igPage = await graphGet(
        `${encodeURIComponent(igMe.json.id)}?fields=id,username,name,connected_facebook_page`,
        tok
      );
      const connected = igPage.json?.connected_facebook_page;
      const cpid = connected?.id || (typeof connected === 'string' ? connected : null);
      if (igPage.ok && cpid && !looksLikeConfigurationId(cpid)) {
        pid = String(cpid);
        out.page_name = out.page_name || connected?.name || igMe.json?.name || username;
        out.steps.push({ step: 'ig_connected_page', ok: true, page_id_suffix: pid.slice(-6) });
      } else {
        out.steps.push({
          step: 'ig_connected_page',
          ok: Boolean(igPage.ok && cpid),
          error: igPage.ok ? 'connected_facebook_page_missing' : graphErr(igPage.json, `http_${igPage.status}`)
        });
      }
    } else {
      // Page token: me.id is the page. User token without pages_show_list: me.id is the person — abone edilemez.
      const probe = await graphGet(
        `${encodeURIComponent(me.json.id)}/subscribed_apps?fields=id,name,subscribed_fields`,
        tok
      );
      if (probe.ok) {
        out.token_kind = 'page';
        if (!pid) pid = String(me.json.id);
        out.page_name = out.page_name || me.json.name || null;
      } else {
        out.token_kind = 'user_no_pages';
        out.steps.push({
          step: 'not_a_page_token',
          ok: false,
          error: graphErr(probe.json, `http_${probe.status}`),
          hint: 'Vercel’deki token kullanıcı token’ı. Graph Explorer’da pages_show_list + pages_messaging ile SAYFA token’ı alın.'
        });
      }
    }
    const directIg = igMe.ok ? igMe.json?.instagram_business_account?.id : null;
    if (directIg && !looksLikeConfigurationId(directIg)) {
      out.instagram_business_id = String(directIg);
      process.env.META_IG_BUSINESS_ID = String(directIg);
    }
  } else {
    out.steps.push({
      step: 'token_identity',
      ok: false,
      source: resolved.source,
      error: graphErr(me.json, `http_${me.status}`)
    });
  }

  if (looksLikeConfigurationId(pid)) {
    out.steps.push({
      step: 'reject_config_id_as_page',
      ok: false,
      error: 'META_PAGE_ID cannot be Facebook Login configuration id 1784…'
    });
    pid = '';
  }

  out.page_id = pid || null;
  if (!pid) {
    out.error = out.token_kind === 'user_no_pages' ? 'user_token_not_page_token' : 'page_id_unresolved';
    out.hint =
      out.token_kind === 'user_no_pages'
        ? 'Vercel INSTAGRAM_PAGE_ACCESS_TOKEN şu an kişisel kullanıcı token’ı (sayfa listesi boş). Graph Explorer → SmartKocluk → pages_show_list + pages_messaging + instagram_manage_messages → listeden SAYFA Access Token alın, Vercel’e onu yazın ve Redeploy edin.'
        : 'Sayfa kimliği yok. Meta BM → Sayfa → Page ID’yi Vercel META_PAGE_ID olarak kaydedin.';
    return out;
  }

  const subGet = await graphGet(
    `${encodeURIComponent(pid)}/subscribed_apps?fields=id,name,subscribed_fields`,
    useTok
  );
  if (subGet.ok) {
    const rows = Array.isArray(subGet.json?.data) ? subGet.json.data : [];
    out.subscribed_fields = rows.flatMap((r) => r.subscribed_fields || []);
    out.steps.push({ step: 'page_subscribed_apps', ok: true, count: rows.length });
  } else {
    out.steps.push({
      step: 'page_subscribed_apps',
      ok: false,
      error: graphErr(subGet.json, `http_${subGet.status}`)
    });
  }

  const hasMessages = (out.subscribed_fields || []).includes('messages');
  if (apply) {
    out.applied = true;
    const sub = await graphPost(`${encodeURIComponent(pid)}/subscribed_apps`, useTok, {
      subscribed_fields: PAGE_FIELDS
    });
    out.steps.push({
      step: 'subscribe_page_messages',
      ok: sub.ok,
      error: sub.ok ? null : graphErr(sub.json, `http_${sub.status}`)
    });
    if (sub.ok) {
      out.subscribed_fields = PAGE_FIELDS.split(',');
    }
    try {
      await saveMetaPageSecretsToDb({
        token: useTok,
        page_id: pid,
        instagram_business_account_id: out.instagram_business_id || undefined,
        configuration_id: out.configuration_id || undefined
      });
    } catch (e) {
      out.steps.push({
        step: 'persist_page_secrets',
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
    try {
      const appSub = await ensureAppSocialSubscriptions({ apply: true });
      out.app_subscriptions = appSub;
      out.steps.push({
        step: 'app_subscriptions',
        ok: Boolean(appSub?.ok),
        error: appSub?.error || null
      });
    } catch (e) {
      out.steps.push({
        step: 'app_subscriptions',
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  const bound = Boolean(pid && (hasMessages || (apply && out.steps.some((s) => s.step === 'subscribe_page_messages' && s.ok))));
  out.ok = bound;
  out.hint = bound
    ? `Facebook/Instagram DM webhook ${PRODUCTION_WEBHOOK_URL} — sayfa ${out.page_name || pid} mesajlara abone.`
    : 'Sayfa messages alanına abone değil. Hattı bağla ile subscribed_apps çalışır; App Dashboard’da Instagram + Messenger webhook alanları da işaretli olmalı.';
  if (!out.ok && !out.error) out.error = 'not_bound_yet';
  return out;
}

export function publicSocialStatus(full) {
  return {
    ok: Boolean(full?.ok),
    token_present: Boolean(full?.token_present),
    token_source: full?.token_source || null,
    token_kind: full?.token_kind || null,
    page_name: full?.page_name || null,
    page_id_suffix: full?.page_id ? String(full.page_id).slice(-6) : null,
    instagram_business_id_suffix: full?.instagram_business_id
      ? String(full.instagram_business_id).slice(-6)
      : null,
    configuration_id: full?.configuration_id || DEFAULT_META_CONFIGURATION_ID,
    app_id: appIdEnv(),
    app_subscriptions_ok: Boolean(full?.app_subscriptions?.ok),
    hint: full?.hint || null,
    applied: Boolean(full?.applied)
  };
}

export async function ensureAppSocialSubscriptions({ apply = false } = {}) {
  const appId = appIdEnv();
  const appTok = appAccessToken();
  const verify = verifyTokenEnv();
  const out = {
    ok: false,
    applied: false,
    app_id: appId,
    has_app_secret: Boolean(appSecretEnv()),
    has_verify_token: Boolean(verify),
    page: null,
    instagram: null,
    hint: null,
    error: null
  };
  if (!appTok) {
    out.error = 'app_secret_missing';
    out.hint =
      'App Dashboard’da instagram + page webhook alanlarını işaretleyin veya Vercel META_APP_SECRET ekleyin (APP_ID|SECRET ile otomatik abone).';
    return out;
  }
  if (!verify) {
    out.error = 'verify_token_missing';
    out.hint = 'META_WEBHOOK_VERIFY_TOKEN olmadan Graph app subscriptions doğrulanamaz.';
    return out;
  }

  const existing = await graphGet(`${encodeURIComponent(appId)}/subscriptions`, appTok);
  const rows = existing.ok && Array.isArray(existing.json?.data) ? existing.json.data : [];
  const hasPage = rows.some(
    (r) => String(r?.object || '') === 'page' && String(r?.callback_url || '').includes('/api/meta/webhook')
  );
  const hasIg = rows.some(
    (r) => String(r?.object || '') === 'instagram' && String(r?.callback_url || '').includes('/api/meta/webhook')
  );
  out.page = { subscribed: hasPage };
  out.instagram = { subscribed: hasIg };

  if (!apply) {
    out.ok = hasPage && hasIg;
    out.hint = out.ok
      ? 'SmartKocluk app page + instagram webhook alanları production URL’ye abone.'
      : 'App-level instagram/page subscription eksik — Hattı bağla veya META_APP_SECRET ile ensure.';
    if (!out.ok) out.error = 'app_subscriptions_incomplete';
    return out;
  }

  out.applied = true;
  const common = {
    callback_url: PRODUCTION_WEBHOOK_URL,
    verify_token: verify,
    access_token: appTok
  };
  const pageSub = await graphFormPost(`${encodeURIComponent(appId)}/subscriptions`, {
    ...common,
    object: 'page',
    fields: PAGE_FIELDS
  });
  const igSub = await graphFormPost(`${encodeURIComponent(appId)}/subscriptions`, {
    ...common,
    object: 'instagram',
    fields: 'messages,messaging_postbacks,messaging_optins,messaging_seen,messaging_handover,standby'
  });
  out.page = { subscribed: pageSub.ok, error: pageSub.ok ? null : graphErr(pageSub.json, `http_${pageSub.status}`) };
  out.instagram = { subscribed: igSub.ok, error: igSub.ok ? null : graphErr(igSub.json, `http_${igSub.status}`) };
  out.ok = Boolean(pageSub.ok && igSub.ok);
  out.hint = out.ok
    ? `App webhook (page + instagram) → ${PRODUCTION_WEBHOOK_URL}`
    : out.page?.error || out.instagram?.error || 'app_subscribe_failed';
  if (!out.ok) out.error = out.hint;
  return out;
}

async function exchangeLongLivedUserToken(userToken) {
  const id = appIdEnv();
  const secret = appSecretEnv();
  if (!id || !secret || !userToken) return userToken;
  const url = `https://graph.facebook.com/${GRAPH()}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: id,
    client_secret: secret,
    fb_exchange_token: userToken
  })}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return String(json?.access_token || userToken).trim();
}

/**
 * Facebook Login for Business (config_id=1784538625891317) user token → Page token + subscribe.
 */
export async function bindMetaSocialFromUserToken(userAccessToken) {
  await loadMetaWhatsAppSecretsFromDb();
  const short = String(userAccessToken || '').trim();
  if (!short) return { ok: false, error: 'user_token_missing', hint: 'Facebook Login access token gerekli.' };
  const userTok = await exchangeLongLivedUserToken(short);
  const me = await graphGet(
    'me/accounts?fields=name,id,access_token,instagram_business_account{id,username,name}&limit=25',
    userTok
  );
  if (!me.ok) {
    return {
      ok: false,
      error: graphErr(me.json, `http_${me.status}`),
      hint: 'Token sayfa listesi alamadı. Login for Business config_id=1784538625891317 ve pages_show_list / pages_messaging yetkisi gerekir.'
    };
  }
  const accounts = Array.isArray(me.json?.data) ? me.json.data : [];
  if (!accounts.length) {
    return {
      ok: false,
      error: 'no_pages',
      hint: 'Bu Facebook kullanıcısının yönettiği Sayfa yok. BM’de sayfa yöneticisi ile giriş yapın.'
    };
  }
  const preferred = accounts.find((a) => a?.instagram_business_account?.id) || accounts[0];
  const pageTok = String(preferred.access_token || '').trim();
  const pageId = String(preferred.id || '').trim();
  if (!pageTok || !pageId) {
    return { ok: false, error: 'page_token_missing', hint: 'Sayfa access_token boş döndü.' };
  }
  process.env.META_PAGE_ACCESS_TOKEN = pageTok;
  process.env.META_PAGE_ID = pageId;
  const igId = preferred?.instagram_business_account?.id
    ? String(preferred.instagram_business_account.id)
    : '';
  if (igId && !looksLikeConfigurationId(igId)) {
    process.env.META_IG_BUSINESS_ID = igId;
  }
  try {
    await saveMetaPageSecretsToDb({
      token: pageTok,
      page_id: pageId,
      instagram_business_account_id: igId && !looksLikeConfigurationId(igId) ? igId : undefined,
      configuration_id: DEFAULT_META_CONFIGURATION_ID
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      hint: 'Sayfa token alındı ama commerce_settings yazılamadı.'
    };
  }
  const social = await ensureMetaSocialInbound({ apply: true });
  return {
    ok: Boolean(social?.ok),
    page_name: preferred.name || social?.page_name || null,
    page_id: pageId,
    instagram_business_id: igId || social?.instagram_business_id || null,
    social,
    hint: social?.hint || null,
    error: social?.error || null
  };
}

export async function bindMetaSocialFromPageToken(pageAccessToken, pageIdHint = '') {
  const tok = String(pageAccessToken || '').trim();
  if (!tok) return { ok: false, error: 'page_token_missing' };
  let pid = String(pageIdHint || '').trim();
  if (looksLikeConfigurationId(pid)) pid = '';
  process.env.META_PAGE_ACCESS_TOKEN = tok;
  if (pid) process.env.META_PAGE_ID = pid;
  try {
    await saveMetaPageSecretsToDb({
      token: tok,
      page_id: pid || undefined,
      configuration_id: DEFAULT_META_CONFIGURATION_ID
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const social = await ensureMetaSocialInbound({ apply: true });
  return {
    ok: Boolean(social?.ok),
    social,
    page_name: social?.page_name || null,
    hint: social?.hint || null,
    error: social?.error || null
  };
}
