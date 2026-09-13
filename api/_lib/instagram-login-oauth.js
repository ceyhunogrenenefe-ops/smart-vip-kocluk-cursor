/**
 * SmartKocluk-IG — Instagram API with Instagram Login (Business Login).
 * App ID 1455769949705434 bir Facebook App ID değildir; client_credentials çalışmaz.
 * Kullanıcı Instagram’da yetki verir → code → user token → CRM bind.
 */
import crypto from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';

export const DEFAULT_INSTAGRAM_APP_ID = '1455769949705434';
export const PRODUCTION_IG_OAUTH_REDIRECT =
  'https://www.dersonlinevipkocluk.com/api/meta/instagram-oauth';
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments'
].join(',');

export function instagramAppId() {
  return String(process.env.INSTAGRAM_APP_ID || process.env.META_INSTAGRAM_APP_ID || DEFAULT_INSTAGRAM_APP_ID).trim();
}

export function instagramAppSecret() {
  return String(process.env.INSTAGRAM_APP_SECRET || process.env.META_INSTAGRAM_APP_SECRET || '').trim();
}

export function instagramOauthRedirect() {
  return String(process.env.INSTAGRAM_OAUTH_REDIRECT || PRODUCTION_IG_OAUTH_REDIRECT).trim();
}

function stateKey() {
  return instagramAppSecret() || String(process.env.META_WEBHOOK_VERIFY_TOKEN || 'ig-oauth').trim();
}

export function signIgOauthState() {
  const payload = Buffer.from(JSON.stringify({ n: crypto.randomBytes(8).toString('hex'), exp: Date.now() + 15 * 60_000 })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', stateKey()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyIgOauthState(state) {
  const raw = String(state || '');
  const i = raw.lastIndexOf('.');
  if (i < 1) return false;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expect = crypto.createHmac('sha256', stateKey()).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(json.exp) > Date.now();
  } catch {
    return false;
  }
}

export function instagramAuthorizeUrl() {
  const q = new URLSearchParams({
    client_id: instagramAppId(),
    redirect_uri: instagramOauthRedirect(),
    response_type: 'code',
    scope: SCOPES,
    state: signIgOauthState()
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export async function loadInstagramAppSecretsFromDb() {
  try {
    const { data } = await supabaseAdmin
      .from('commerce_settings')
      .select('meta')
      .is('institution_id', null)
      .maybeSingle();
    const ig = data?.meta?.instagram && typeof data.meta.instagram === 'object' ? data.meta.instagram : {};
    const appId = String(ig.app_id || ig.instagram_app_id || '').trim();
    const secret = String(ig.app_secret || ig.instagram_app_secret || '').trim();
    const userTok = String(ig.user_token || ig.user_access_token || ig.token || '').trim();
    if (appId && !String(process.env.INSTAGRAM_APP_ID || '').trim()) process.env.INSTAGRAM_APP_ID = appId;
    if (secret && !String(process.env.INSTAGRAM_APP_SECRET || '').trim()) process.env.INSTAGRAM_APP_SECRET = secret;
    if (userTok && !String(process.env.INSTAGRAM_ACCESS_TOKEN || '').trim()) {
      process.env.INSTAGRAM_ACCESS_TOKEN = userTok;
    }
    return { app_id: instagramAppId(), has_secret: Boolean(instagramAppSecret()), has_user_token: Boolean(userTok || process.env.INSTAGRAM_ACCESS_TOKEN) };
  } catch {
    return { app_id: instagramAppId(), has_secret: Boolean(instagramAppSecret()), has_user_token: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN) };
  }
}

export async function saveInstagramAppSecretsToDb(patch = {}) {
  const { data: row, error: readErr } = await supabaseAdmin
    .from('commerce_settings')
    .select('id, meta')
    .is('institution_id', null)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row?.id) throw new Error('commerce_settings_global_missing');
  const prevMeta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const prev = prevMeta.instagram && typeof prevMeta.instagram === 'object' ? prevMeta.instagram : {};
  const next = { ...prev };
  if (patch.app_id) next.app_id = String(patch.app_id).trim();
  if (patch.app_secret) next.app_secret = String(patch.app_secret).trim();
  if (patch.user_token) next.user_token = String(patch.user_token).trim();
  if (patch.ig_user_id) next.ig_user_id = String(patch.ig_user_id).trim();
  if (patch.username) next.username = String(patch.username).trim();
  next.updated_at = new Date().toISOString();
  const { error: writeErr } = await supabaseAdmin
    .from('commerce_settings')
    .update({ meta: { ...prevMeta, instagram: next }, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (writeErr) throw new Error(writeErr.message);
  if (next.app_id) process.env.INSTAGRAM_APP_ID = next.app_id;
  if (next.app_secret) process.env.INSTAGRAM_APP_SECRET = next.app_secret;
  if (next.user_token) process.env.INSTAGRAM_ACCESS_TOKEN = next.user_token;
  return { app_id: next.app_id || instagramAppId(), has_secret: Boolean(next.app_secret || instagramAppSecret()) };
}

async function igGet(path, tok) {
  const url = path.startsWith('http') ? path : `https://graph.instagram.com/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function exchangeInstagramCode(code) {
  const secret = instagramAppSecret();
  if (!secret) {
    const err = new Error('instagram_app_secret_missing');
    err.code = 'ENV';
    throw err;
  }
  const body = new URLSearchParams({
    client_id: instagramAppId(),
    client_secret: secret,
    grant_type: 'authorization_code',
    redirect_uri: instagramOauthRedirect(),
    code: String(code || '').trim()
  });
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    const err = new Error(json?.error_message || json?.error?.message || `ig_oauth_http_${res.status}`);
    err.raw = json;
    throw err;
  }
  let token = String(json.access_token);
  let userId = json.user_id != null ? String(json.user_id) : null;
  const longLived = await fetch(
    `https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: secret,
      access_token: token
    })}`
  );
  const longJson = await longLived.json().catch(() => ({}));
  if (longLived.ok && longJson?.access_token) token = String(longJson.access_token);

  const me = await igGet('me?fields=id,username,name,account_type', token);
  const username = me.ok ? String(me.json?.username || '').trim() || null : null;
  if (me.ok && me.json?.id) userId = String(me.json.id);

  await saveInstagramAppSecretsToDb({
    app_id: instagramAppId(),
    user_token: token,
    ig_user_id: userId || undefined,
    username: username || undefined
  });

  return {
    ok: true,
    ig_user_id: userId,
    username,
    token_suffix: token.slice(-6),
    permissions: json.permissions || null
  };
}

export function publicInstagramOauthStatus() {
  return {
    app_id: instagramAppId(),
    has_secret: Boolean(instagramAppSecret()),
    has_user_token: Boolean(String(process.env.INSTAGRAM_ACCESS_TOKEN || '').trim()),
    redirect_uri: instagramOauthRedirect(),
    authorize_hint:
      'Meta → Instagram → API setup with Instagram login → Business login settings → Valid OAuth Redirect URIs’e bu adresi ekleyin.'
  };
}
