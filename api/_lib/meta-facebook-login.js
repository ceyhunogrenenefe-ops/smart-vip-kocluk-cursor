/**
 * Kommo widget eşdeğeri: Facebook Login for Business (SmartKocluk + config_id).
 * Bu akış yalnızca response_type=code kabul eder (token enum değil).
 * Code değişimi için META_APP_SECRET / SmartKocluk Facebook App Secret gerekir.
 */
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
export const DEFAULT_META_APP_ID = '1290015412657616';
export const DEFAULT_META_CONFIGURATION_ID = '1784538625891317';
export const PRODUCTION_ORIGIN = 'https://www.dersonlinevipkocluk.com';
export const WIDGET_PATH = '/crm/widgetler';
export const OAUTH_PATH = '/api/meta/facebook-oauth';

export function metaFacebookAppId() {
  return String(process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || DEFAULT_META_APP_ID).trim();
}

export function metaFacebookConfigId() {
  return String(process.env.META_CONFIGURATION_ID || DEFAULT_META_CONFIGURATION_ID).trim();
}

export function metaFacebookGraphVersion() {
  return String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
}

export function metaFacebookAppSecret() {
  return String(process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim();
}

export function widgetRedirectUri(origin = PRODUCTION_ORIGIN) {
  return `${String(origin || PRODUCTION_ORIGIN).replace(/\/$/, '')}${WIDGET_PATH}`;
}

export function oauthRedirectUri(origin = PRODUCTION_ORIGIN) {
  return `${String(origin || PRODUCTION_ORIGIN).replace(/\/$/, '')}${OAUTH_PATH}`;
}

/** Sayfa + Instagram DM — Login for Business varlık listesi yok, 1349246 olmaz. */
export const PAGE_IG_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'public_profile'
].join(',');

/**
 * mode=scopes: klasik Facebook Login (önerilen — yalnızca Online VIP sayfası).
 * mode=config: Login for Business config_id (BM’deki tüm varlıklara izin ister, 1349246 verebilir).
 */
export function buildFacebookLoginUrl({
  responseType = 'code',
  redirectUri,
  state,
  origin = PRODUCTION_ORIGIN,
  mode = 'scopes'
} = {}) {
  const type = responseType === 'token' ? 'token' : 'code';
  const uri = redirectUri || oauthRedirectUri(origin);
  const params = new URLSearchParams({
    client_id: metaFacebookAppId(),
    redirect_uri: uri,
    response_type: type
  });
  if (mode === 'config') {
    params.set('config_id', metaFacebookConfigId());
    params.set('override_default_response_type', 'true');
  } else {
    params.set('scope', PAGE_IG_OAUTH_SCOPES);
  }
  if (state) params.set('state', String(state));
  return `https://www.facebook.com/${metaFacebookGraphVersion()}/dialog/oauth?${params.toString()}`;
}

export function parseFacebookRedirectHash(hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  if (!raw) return { access_token: '', error: null, error_description: null };
  const params = new URLSearchParams(raw);
  return {
    access_token: String(params.get('access_token') || '').trim(),
    expires_in: params.get('expires_in'),
    error: params.get('error') || params.get('error_code') || null,
    error_description: params.get('error_description') || params.get('error_message') || null
  };
}

export function facebookOAuthWhitelistUris(origin = PRODUCTION_ORIGIN) {
  const primary = oauthRedirectUri(origin);
  const widget = widgetRedirectUri(origin);
  const apexOauth = 'https://dersonlinevipkocluk.com/api/meta/facebook-oauth';
  const apexWidget = 'https://dersonlinevipkocluk.com/crm/widgetler';
  return [...new Set([primary, widget, apexOauth, apexWidget])];
}

export function describeFacebookLoginWidget(origin = PRODUCTION_ORIGIN, { state } = {}) {
  const hasSecret = Boolean(metaFacebookAppSecret());
  const oauth = oauthRedirectUri(origin);
  const authorize = buildFacebookLoginUrl({ responseType: 'code', origin, state, mode: 'scopes' });
  const configAuthorize = buildFacebookLoginUrl({
    responseType: 'code',
    origin,
    state,
    mode: 'config'
  });
  return {
    app_id: metaFacebookAppId(),
    config_id: metaFacebookConfigId(),
    graph_version: metaFacebookGraphVersion(),
    widget_redirect_uri: widgetRedirectUri(origin),
    oauth_redirect_uri: oauth,
    whitelist_uris: facebookOAuthWhitelistUris(origin),
    authorize_url: authorize,
    code_authorize_url: authorize,
    config_authorize_url: configAuthorize,
    has_app_secret: hasSecret,
    hint: hasSecret
      ? 'Önerilen: sayfa izinleriyle bağla (config_id yok). 1349246 = Login for Business ekstra varlıklara izin isteyemez.'
      : 'Önce SmartKocluk Facebook App Secret’ı kaydedin (Ayarlar → Temel → App secret). Instagram Login secret değil.'
  };
}

export async function exchangeFacebookOAuthCode(code, redirectUri) {
  await loadMetaWhatsAppSecretsFromDb();
  const id = metaFacebookAppId();
  const secret = metaFacebookAppSecret();
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, error: 'code_missing', access_token: '' };
  if (!id || !secret) return { ok: false, error: 'app_secret_missing', access_token: '' };
  const url = `https://graph.facebook.com/${metaFacebookGraphVersion()}/oauth/access_token?${new URLSearchParams({
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri || oauthRedirectUri(),
    code: trimmed
  })}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  const token = String(json?.access_token || '').trim();
  if (!token) {
    return {
      ok: false,
      error: json?.error?.message || 'code_exchange_failed',
      access_token: ''
    };
  }
  return { ok: true, access_token: token };
}
