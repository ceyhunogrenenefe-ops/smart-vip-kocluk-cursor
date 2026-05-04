import { google } from 'googleapis';
import { verifyAuthToken } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { encryptForStorage } from '../api/_lib/token-crypto.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { integrationsGoogleSkipUserRowCheck } from '../api/_lib/google-integration-flags.js';

const resolvePublicAppUrl = () => {
  const explicit = process.env.FRONTEND_APP_URL?.replace(/\/+$/, '').trim();
  if (explicit) return explicit;
  const redir = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (redir) {
    try {
      const u = new URL(redir);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  const vu = process.env.VERCEL_URL?.trim();
  if (vu) {
    const host = vu.replace(/^https?:\/\//i, '');
    return `https://${host}`;
  }
  return '';
};

/** Vercel bazen query değerini dizi döndürür */
function firstQueryParam(query, key) {
  const v = query?.[key];
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return String(v[0] ?? '');
  return String(v);
}

const originFromRedirectEnv = () => {
  const r = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!r) return '';
  try {
    return new URL(r).origin;
  } catch {
    return '';
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const publicBase = resolvePublicAppUrl() || originFromRedirectEnv();

  try {
    const code = firstQueryParam(req.query, 'code');
    const stateRaw = firstQueryParam(req.query, 'state');

    const redirectFail = (codeErr) =>
      publicBase
        ? res.redirect(302, `${publicBase}/meetings?google_error=${encodeURIComponent(codeErr)}`)
        : res.status(400).send(codeErr);

    /** Google izin ekranı reddi / test kullanıcısı değil → error=access_denied (code gelmez) */
    const oauthErr = firstQueryParam(req.query, 'error');
    if (oauthErr) {
      if (oauthErr === 'access_denied') {
        return redirectFail('google_testing_only_add_email');
      }
      const desc = firstQueryParam(req.query, 'error_description');
      return redirectFail(
        desc ? `${oauthErr}: ${desc.slice(0, 300)}` : oauthErr
      );
    }

    if (!code || !stateRaw) return redirectFail('missing_code_or_state');

    let decoded;
    try {
      decoded = verifyAuthToken(stateRaw);
    } catch {
      return redirectFail('invalid_state_token');
    }
    if (decoded.oauth_purpose !== 'google_calendar' || !decoded.sub) {
      return redirectFail('invalid_state_payload');
    }

    const userId = decoded.sub;

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      return redirectFail('google_oauth_env_missing');
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    let getTokenErr = null;
    let tokenResponse = null;
    try {
      const pkceVerifier =
        typeof decoded.pkce_v === 'string' && decoded.pkce_v.length > 0 ? decoded.pkce_v : null;
      if (pkceVerifier) {
        tokenResponse = await oauth2Client.getToken({ code, codeVerifier: pkceVerifier });
      } else {
        tokenResponse = await oauth2Client.getToken(code);
      }
    } catch (err) {
      getTokenErr = err;
      tokenResponse = null;
    }
    const tokens = tokenResponse?.tokens;
    if (!tokens?.access_token && !tokens?.refresh_token) {
      const detail = getTokenErr && typeof getTokenErr.message === 'string' ? getTokenErr.message : '';
      if (/invalid_grant|Invalid Grant/i.test(detail)) {
        return redirectFail('oauth_invalid_grant');
      }
      if (/redirect_uri|Redirect URI/i.test(detail)) {
        return redirectFail('oauth_redirect_uri_mismatch');
      }
      return redirectFail(detail ? `oauth_token_exchange_failed:${detail.slice(0, 120)}` : 'oauth_token_exchange_failed');
    }

    /** Google ikinci+ girişte refresh_token vermeyebilir; yalnız access_token kaydedilir (kısa ömür, yeniden yetkilendirme gerekebilir) */
    const expiryMs = tokens.expiry_date ? Number(tokens.expiry_date) : Date.now() + 3600_000;

    const refreshToStore = tokens.refresh_token || '';

    if (!integrationsGoogleSkipUserRowCheck()) {
      const { data: userRow, error: userLookupErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (userLookupErr) {
        console.error('[google-callback] users lookup', userLookupErr);
        return redirectFail(`supabase_save:${errorMessage(userLookupErr).slice(0, 220)}`);
      }
      if (!userRow?.id) {
        return redirectFail(
          String(userId).startsWith('demo-')
            ? 'integrations_requires_db_user_demo'
            : 'integrations_requires_db_user'
        );
      }
    }

    const { error: upsertErr } = await supabaseAdmin.from('integrations_google').upsert(
      {
        user_id: userId,
        encrypted_refresh_token: encryptForStorage(refreshToStore),
        encrypted_access_token: tokens.access_token ? encryptForStorage(tokens.access_token) : null,
        expiry_date_ms: expiryMs,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    );
    if (upsertErr) {
      console.error('[google-callback] integrations_google upsert', upsertErr);
      return redirectFail(`supabase_save:${errorMessage(upsertErr).slice(0, 220)}`);
    }

    const target = `${publicBase}/meetings?google_connected=1`;
    if (publicBase) return res.redirect(302, target);
    return res.status(200).json({ ok: true, user_id: userId });
  } catch (e) {
    console.error('[google-callback] unhandled', e);
    const raw = errorMessage(e);
    const msg = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
    if (publicBase) {
      return res.redirect(302, `${publicBase}/meetings?google_error=${encodeURIComponent(`cb:${msg}`)}`);
    }
    return res.status(500).json({ error: msg });
  }
}

