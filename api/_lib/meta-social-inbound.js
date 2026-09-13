/**
 * Facebook Page + Instagram DM webhook bağlama (WhatsApp WABA bind’inin sosyal karşılığı).
 * Page token: META_PAGE_ACCESS_TOKEN / INSTAGRAM_PAGE_ACCESS_TOKEN / commerce_settings.meta.page
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
export const PRODUCTION_WEBHOOK_URL = 'https://www.dersonlinevipkocluk.com/api/meta/webhook';

/** Meta App / Instagram yapılandırma kodu (panelde oluşturulan 16 haneli id). */
export const DEFAULT_META_IG_BUSINESS_ID = '1784538625891317';
export const DEFAULT_META_CONFIGURATION_ID = '1784538625891317';

const PAGE_FIELDS = [
  'messages',
  'messaging_postbacks',
  'messaging_optins',
  'message_echoes',
  'messaging_referrals',
  'standby'
].join(',');

function pageToken() {
  return String(
    process.env.META_PAGE_ACCESS_TOKEN ||
      process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ||
      process.env.META_WHATSAPP_TOKEN ||
      ''
  ).trim();
}

function pageIdEnv() {
  return String(process.env.META_PAGE_ID || '').trim();
}

function igBusinessIdEnv() {
  return String(
    process.env.META_IG_BUSINESS_ID ||
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ||
      DEFAULT_META_IG_BUSINESS_ID
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

export async function lookupSocialProfileName(scopedId, tok = pageToken()) {
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
  const tok = pageToken();
  /** @type {Record<string, unknown>} */
  const out = {
    ok: false,
    applied: false,
    token_present: Boolean(tok),
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
      'Facebook / Instagram DM için Page Access Token gerekir (META_PAGE_ACCESS_TOKEN). WhatsApp system user token sayfa mesajı abone edemez.';
    return out;
  }

  let pid = pageIdEnv();
  const me = await graphGet('me?fields=id,name,accounts{name,id,access_token,instagram_business_account}', tok);
  if (me.ok) {
    out.steps.push({ step: 'token_identity', ok: true, name: me.json?.name || null, id_suffix: String(me.json?.id || '').slice(-6) });
    const accounts = Array.isArray(me.json?.accounts?.data) ? me.json.accounts.data : [];
    if (!pid && accounts[0]?.id) pid = String(accounts[0].id);
    if (accounts[0]?.access_token) {
      process.env.META_PAGE_ACCESS_TOKEN = String(accounts[0].access_token);
    }
    const ig = accounts[0]?.instagram_business_account?.id;
    if (ig) {
      out.instagram_business_id = String(ig);
      process.env.META_IG_BUSINESS_ID = String(ig);
    }
    if (accounts[0]?.name) out.page_name = String(accounts[0].name);
  } else {
    out.steps.push({
      step: 'token_identity',
      ok: false,
      error: graphErr(me.json, `http_${me.status}`)
    });
  }

  if (!pid) {
    const pageLookup = await graphGet('me?fields=id,name', tok);
    if (pageLookup.ok && pageLookup.json?.id) {
      pid = String(pageLookup.json.id);
      out.page_name = out.page_name || pageLookup.json.name || null;
    }
  }

  out.page_id = pid || null;
  if (!pid) {
    out.error = 'page_id_unresolved';
    out.hint =
      'Sayfa kimliği yok. Meta BM → Sayfa → Page ID’yi Vercel META_PAGE_ID veya panel commerce_settings.meta.page olarak kaydedin.';
    return out;
  }

  const subGet = await graphGet(
    `${encodeURIComponent(pid)}/subscribed_apps?fields=id,name,subscribed_fields`,
    process.env.META_PAGE_ACCESS_TOKEN || tok
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
    const useTok = process.env.META_PAGE_ACCESS_TOKEN || tok;
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
    page_name: full?.page_name || null,
    page_id_suffix: full?.page_id ? String(full.page_id).slice(-6) : null,
    instagram_business_id_suffix: full?.instagram_business_id
      ? String(full.instagram_business_id).slice(-6)
      : null,
    configuration_id_suffix: full?.configuration_id
      ? String(full.configuration_id).slice(-6)
      : null,
    hint: full?.hint || null,
    applied: Boolean(full?.applied)
  };
}
