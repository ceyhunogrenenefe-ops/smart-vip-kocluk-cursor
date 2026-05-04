import { google } from 'googleapis';
import { signAuthToken, requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { integrationsGoogleSkipUserRowCheck } from '../api/_lib/google-integration-flags.js';

const ALLOWED_CONNECT_ROLES = new Set(['coach', 'admin', 'super_admin']);

function readGoogleOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || '';
  const missing = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!redirectUri) missing.push('GOOGLE_REDIRECT_URI');
  return { clientId, clientSecret, redirectUri, missing };
}

/** POST = OAuth bağlantı URL’si · GET = bağlantı durumu · Hobby için tek fonksiyon. */
export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      let actor;
      try {
        actor = requireAuthenticatedActor(req);
      } catch {
        return res.status(401).json({ error: 'Missing token' });
      }
      if (!ALLOWED_CONNECT_ROLES.has(actor.role)) {
        return res.status(403).json({ error: 'Google Calendar yalnızca koç veya yönetici hesaplarıyla bağlanabilir.' });
      }

      const sid = String(actor.sub || '');
      if (!integrationsGoogleSkipUserRowCheck()) {
        if (sid.startsWith('demo-')) {
          return res.status(400).json({
            error:
              'Demo giriş (demo-*) Supabase users tablosunda kayıtlı değil. Üretimde gerçek kullanıcı ile giriş yapın. Test için: Supabase’te integrations_google → users FK’sini kaldırın ve Vercel’de INTEGRATIONS_GOOGLE_NO_USER_FK=1 + redeploy.',
            code: 'google_oauth_demo_user'
          });
        }

        const { data: userRow, error: userLookupErr } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', sid)
          .maybeSingle();
        if (userLookupErr) {
          return res.status(503).json({ error: errorMessage(userLookupErr), code: 'users_lookup_failed' });
        }
        if (!userRow?.id) {
          return res.status(400).json({
            error:
              'Bu oturum users tablosunda bulunamadı. Google Takvim için Supabase’te kayıtlı kullanıcı ile giriş yapın.',
            code: 'google_oauth_user_not_in_db'
          });
        }
      }

      const { clientId, clientSecret, redirectUri, missing } = readGoogleOAuthEnv();
      if (missing.length > 0) {
        return res.status(503).json({
          error:
            'Vercel sunucu fonksiyonları bu üç değişkeni görmüyor veya boş. Production ortamında tanımlı olduğundan emin olun; kaydettikten sonra yeniden deploy edin. Örnek GOOGLE_REDIRECT_URI: https://smart-kocluk-ceyhu.vercel.app/api/google/callback',
          code: 'google_oauth_env_missing',
          missing
        });
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      /** Google, web istemcilerinde PKCE (S256) olmadan token değişimini reddedebilir. */
      const { codeVerifier, codeChallenge } = await oauth2Client.generateCodeVerifierAsync();
      const state = signAuthToken({
        sub: actor.sub,
        role: actor.role,
        oauth_purpose: 'google_calendar',
        oauth_ver: 2,
        pkce_v: codeVerifier
      });

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'select_account consent',
        include_granted_scopes: true,
        state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        scope: ['https://www.googleapis.com/auth/calendar.events']
      });

      return res.status(200).json({ authUrl });
    }

    if (req.method === 'GET') {
      let actor;
      try {
        actor = requireAuthenticatedActor(req);
      } catch {
        return res.status(401).json({ error: 'Missing token' });
      }

      const { data, error: intErr } = await supabaseAdmin
        .from('integrations_google')
        .select('user_id, updated_at')
        .eq('user_id', actor.sub)
        .maybeSingle();

      if (intErr) {
        const im = errorMessage(intErr);
        if (/does not exist|42P01|schema cache/i.test(im) || String(intErr.code || '') === '42P01') {
          return res.status(200).json({
            connected: false,
            updated_at: null,
            hint: 'integrations_google tablosu yok — MEETINGS_SAAS_SETUP.sql çalıştırın.'
          });
        }
        throw intErr;
      }

      return res.status(200).json({
        connected: Boolean(data?.user_id),
        updated_at: data?.updated_at ?? null
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'google_oauth_failed';
    return res.status(500).json({ error: msg });
  }
}

