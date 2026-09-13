/**
 * Facebook Login for Business callback — Kommo widget’ın native karşılığı.
 * GET ?code= → token değişimi + sayfa bind → /crm/widgetler
 * GET (hash implicit) → widget sayfasına yönlendirir
 */
import { requireAuthenticatedActor, signAuthToken, verifyAuthToken } from '../api/_lib/auth.js';
import { actorIsAdminLike, actorRoleSet } from '../api/_lib/actor-roles.js';
import { bindMetaSocialFromUserToken } from '../api/_lib/meta-social-inbound.js';
import {
  buildFacebookLoginUrl,
  exchangeFacebookOAuthCode,
  oauthRedirectUri,
  widgetRedirectUri
} from '../api/_lib/meta-facebook-login.js';

function redirectToWidgets(res, query = {}) {
  const url = new URL(widgetRedirectUri());
  for (const [key, value] of Object.entries(query)) {
    if (value != null && String(value).trim()) url.searchParams.set(key, String(value).slice(0, 180));
  }
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const q = req.query && typeof req.query === 'object' ? req.query : {};

    if (String(q.start || '') === '1') {
      try {
        const actor = requireAuthenticatedActor(req);
        const roleSet = await actorRoleSet(actor);
        if (!actorIsAdminLike(actor, roleSet)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      } catch {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const state = signAuthToken({ oauth_purpose: 'facebook_login_widget' });
      return res.status(200).json({
        authorize_url: buildFacebookLoginUrl({ responseType: 'code', state })
      });
    }

    const denied = String(q.error || q.error_message || '').trim();
    if (denied) {
      return redirectToWidgets(res, { error: denied });
    }

    const code = String(q.code || '').trim();
    if (!code) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const dest = widgetRedirectUri();
      return res.status(200).send(`<!doctype html>
<meta charset="utf-8"><title>Meta bağlanıyor</title>
<script>
(function () {
  var dest = ${JSON.stringify(dest)};
  var raw = (location.hash || '').replace(/^#/, '');
  var p = new URLSearchParams(raw);
  if (p.get('access_token')) location.replace(dest + '#' + raw);
  else location.replace(dest + (location.search || '?error=oauth_cancelled'));
})();
</script>`);
    }

    const state = String(q.state || '').trim();
    if (state) {
      try {
        const payload = verifyAuthToken(state);
        if (payload?.oauth_purpose !== 'facebook_login_widget') {
          return redirectToWidgets(res, { error: 'oauth_state_invalid' });
        }
      } catch {
        return redirectToWidgets(res, { error: 'oauth_state_invalid' });
      }
    }

    const exchanged = await exchangeFacebookOAuthCode(code, oauthRedirectUri());
    if (!exchanged.ok) {
      return redirectToWidgets(res, { error: exchanged.error || 'code_exchange_failed' });
    }

    const bound = await bindMetaSocialFromUserToken(exchanged.access_token);
    if (!bound.ok) {
      return redirectToWidgets(res, { error: bound.error || 'bind_failed' });
    }
    return redirectToWidgets(res, { connected: '1', page: bound.page_name || '' });
  } catch (e) {
    return redirectToWidgets(res, {
      error: e instanceof Error ? e.message : 'oauth_failed'
    });
  }
}
