/**
 * Facebook Login for Business callback — Kommo widget’ın native karşılığı.
 * GET ?code= → token değişimi + sayfa bind → /crm/widgetler
 * GET (hash implicit) → widget sayfasına yönlendirir
 */
import { requireAuthenticatedActor, signAuthToken, verifyAuthToken } from '../api/_lib/auth.js';
import { actorIsAdminLike, actorRoleSet } from '../api/_lib/actor-roles.js';
import { bindMetaSocialFromUserToken, exchangeLongLivedUserToken } from '../api/_lib/meta-social-inbound.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import {
  buildFacebookLoginUrl,
  exchangeFacebookOAuthCode,
  oauthRedirectUri,
  widgetRedirectUri
} from '../api/_lib/meta-facebook-login.js';

function redirectToWidgets(res, query = {}) {
  const url = new URL(widgetRedirectUri());
  for (const [key, value] of Object.entries(query)) {
    if (value != null && String(value).trim()) url.searchParams.set(key, String(value).slice(0, key === 'ig_seen' ? 600 : 180));
  }
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}

/**
 * Ek Instagram hesabı: Facebook ile giriş → yönetilen sayfalardan ana hesap
 * dışındaki Instagram'lı sayfalar. Tek aday varsa doğrudan eklenir; birden
 * fazlaysa sayfa anahtarları 15 dk sunucuda tutulur ve panelden seçilir.
 */
const PENDING_KEY = 'ig_extra_pending';

async function finishExtraInstagram(res, shortUserToken, statePayload) {
  const acc = await import('../api/_lib/crm-instagram-accounts.js');
  const institutionId = statePayload?.institution_id || null;
  const userTok = await exchangeLongLivedUserToken(shortUserToken);
  const listed = await acc.listExtraInstagramCandidates(userTok, institutionId);
  if (!listed.ok) return redirectToWidgets(res, { ig_extra_error: listed.error || 'page_list_failed' });
  const candidates = listed.candidates || [];
  if (!candidates.length) {
    // Facebook'un paylaştığı sayfaları göster: kullanıcı yeni sayfayı seçmemişse anlasın
    const seen = (listed.seen || [])
      .map((p) => `${p.page_name || p.page_id} (${p.ig_username ? `@${p.ig_username}` : 'Instagram bağlı değil'}${p.primary ? ', ana hesap' : ''})`)
      .join('; ');
    console.info('[facebook-oauth] extra_ig no_candidates', { seen_count: (listed.seen || []).length });
    return redirectToWidgets(res, { ig_extra_error: 'no_candidates', ig_seen: seen || 'hiç sayfa yok' });
  }

  if (candidates.length === 1) {
    const c = candidates[0];
    const saved = await acc.saveExtraInstagramAccount({
      institutionId,
      pageId: c.page_id,
      pageToken: c.page_token,
      createdBy: statePayload?.sub || null
    });
    if (!saved.ok) return redirectToWidgets(res, { ig_extra_error: saved.message || saved.error });
    return redirectToWidgets(res, { ig_extra: 'added', ig_username: c.ig_username || '' });
  }

  const { data: row } = await supabaseAdmin
    .from('commerce_settings')
    .select('id, meta')
    .is('institution_id', null)
    .maybeSingle();
  if (!row?.id) return redirectToWidgets(res, { ig_extra_error: 'settings_missing' });
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  await supabaseAdmin
    .from('commerce_settings')
    .update({
      meta: {
        ...meta,
        [PENDING_KEY]: {
          institution_id: institutionId,
          created_by: statePayload?.sub || null,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          candidates
        }
      }
    })
    .eq('id', row.id);
  return redirectToWidgets(res, { ig_extra: 'pick' });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const q = req.query && typeof req.query === 'object' ? req.query : {};

    if (String(q.start || '') === '1') {
      let actor;
      try {
        actor = requireAuthenticatedActor(req);
        const roleSet = await actorRoleSet(actor);
        if (!actorIsAdminLike(actor, roleSet)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      } catch {
        return res.status(401).json({ error: 'unauthorized' });
      }
      // purpose=extra_ig → ana hesaba dokunmadan ek Instagram hesabı eklenir
      const extra = String(q.purpose || '') === 'extra_ig';
      const state = signAuthToken(
        extra
          ? { oauth_purpose: 'facebook_login_extra_ig', institution_id: actor.institution_id || null, sub: actor.sub }
          : { oauth_purpose: 'facebook_login_widget' }
      );
      return res.status(200).json({
        authorize_url: buildFacebookLoginUrl({
          responseType: 'code',
          state,
          ...(extra ? { authType: 'rerequest' } : {})
        })
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
    let statePayload = null;
    if (state) {
      try {
        statePayload = verifyAuthToken(state);
        if (!['facebook_login_widget', 'facebook_login_extra_ig'].includes(statePayload?.oauth_purpose)) {
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

    if (statePayload?.oauth_purpose === 'facebook_login_extra_ig') {
      return await finishExtraInstagram(res, exchanged.access_token, statePayload);
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
