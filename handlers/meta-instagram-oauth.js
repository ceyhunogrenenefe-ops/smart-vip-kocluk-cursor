/**
 * GET /api/meta/instagram-oauth
 *  - ?start=1  (oturum gerekli) → Instagram yetki ekranı
 *  - ?code=&state=  Instagram callback (public)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import {
  exchangeInstagramCode,
  instagramAppSecret,
  instagramAuthorizeUrl,
  loadInstagramAppSecretsFromDb,
  publicInstagramOauthStatus,
  verifyIgOauthState
} from '../api/_lib/instagram-login-oauth.js';
import { ensureMetaSocialInbound } from '../api/_lib/meta-social-inbound.js';

function htmlPage(title, body) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#0f172a}
a{color:#047857;font-weight:600}</style></head><body>${body}</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await loadInstagramAppSecretsFromDb();

  const start = String(req.query?.start || '') === '1';
  const code = String(req.query?.code || '').trim();
  const state = String(req.query?.state || '').trim();
  const errQ = String(req.query?.error_description || req.query?.error || '').trim();

  if (start) {
    try {
      const actor = requireAuthenticatedActor(req);
      const roles = await actorRoleSet(actor);
      if (!actorIsAdminLike(actor, roles)) {
        return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca yönetici Instagram bağlar.' });
      }
    } catch {
      return res.status(401).json({ error: 'unauthorized', hint: 'CRM’e giriş yapıp tekrar deneyin.' });
    }
    if (!instagramAppSecret()) {
      return res.status(400).json({
        error: 'instagram_app_secret_missing',
        hint: 'Vercel INSTAGRAM_APP_SECRET veya Inbox’tan SmartKocluk-IG secret kaydedin.',
        ...publicInstagramOauthStatus()
      });
    }
    return res.redirect(302, instagramAuthorizeUrl());
  }

  if (errQ) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(
      htmlPage(
        'Instagram bağlanamadı',
        `<h1>Instagram yetkisi iptal</h1><p>${errQ}</p><p><a href="/crm/inbox">Inbox’a dön</a></p>`
      )
    );
  }

  if (code) {
    if (!verifyIgOauthState(state)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(
        htmlPage(
          'Instagram state hatalı',
          '<h1>Oturum doğrulanamadı</h1><p>15 dakika içinde tekrar «Instagram ile bağla» deyin.</p><p><a href="/crm/inbox">Inbox</a></p>'
        )
      );
    }
    try {
      const exchanged = await exchangeInstagramCode(code);
      const social = await ensureMetaSocialInbound({ apply: true }).catch(() => null);
      const ok = Boolean(exchanged?.ok);
      const qs = new URLSearchParams({
        ig: ok ? 'ok' : 'fail',
        user: exchanged?.username || '',
        social: social?.ok ? '1' : '0'
      });
      return res.redirect(302, `/crm/inbox?${qs}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(
        htmlPage(
          'Instagram token alınamadı',
          `<h1>Token değişimi başarısız</h1><p>${msg}</p><p>Redirect URI Meta panelde tam olarak şu olmalı:<br/><code>${publicInstagramOauthStatus().redirect_uri}</code></p><p><a href="/crm/inbox">Inbox</a></p>`
        )
      );
    }
  }

  return res.status(200).json({
    ok: true,
    service: 'instagram-login-oauth',
    ...publicInstagramOauthStatus()
  });
}
