/**
 * Kommo widget eşdeğeri: Facebook Login for Business (SmartKocluk + config_id).
 * Popup / implicit token — META_APP_SECRET olmadan da Sayfa token üretir.
 */
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

/**
 * Facebook Login for Business dialog.
 * responseType=token → hash’te access_token (app secret gerekmez, Kommo popup gibi).
 * responseType=code → sunucu değişimi (META_APP_SECRET).
 */
export function buildFacebookLoginUrl({
  responseType = 'token',
  redirectUri,
  state,
  origin = PRODUCTION_ORIGIN
} = {}) {
  const type = responseType === 'code' ? 'code' : 'token';
  const uri = redirectUri || (type === 'code' ? oauthRedirectUri(origin) : widgetRedirectUri(origin));
  const params = new URLSearchParams({
    client_id: metaFacebookAppId(),
    redirect_uri: uri,
    config_id: metaFacebookConfigId(),
    response_type: type,
    override_default_response_type: 'true'
  });
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

export function describeFacebookLoginWidget(origin = PRODUCTION_ORIGIN) {
  const hasSecret = Boolean(metaFacebookAppSecret());
  return {
    app_id: metaFacebookAppId(),
    config_id: metaFacebookConfigId(),
    graph_version: metaFacebookGraphVersion(),
    widget_redirect_uri: widgetRedirectUri(origin),
    oauth_redirect_uri: oauthRedirectUri(origin),
    authorize_url: buildFacebookLoginUrl({ responseType: 'token', origin }),
    code_authorize_url: hasSecret ? buildFacebookLoginUrl({ responseType: 'code', origin }) : null,
    has_app_secret: hasSecret,
    hint:
      'Meta App Dashboard → Facebook Login → Valid OAuth Redirect URIs ekleyin: /crm/widgetler ve /api/meta/facebook-oauth. Popup’ta Online VIP sayfasını seçin — Kommo widget ile aynı Login for Business.'
  };
}

export async function exchangeFacebookOAuthCode(code, redirectUri) {
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
