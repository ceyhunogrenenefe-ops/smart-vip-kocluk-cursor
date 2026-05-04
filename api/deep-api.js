/**
 * `/api/google/...` ve `/api/cron/...` — Vite+Vercel’de çok segment tek handler’a düşmez; rewrite ile buraya gelir.
 */
import { routeLoaders } from './_route-loaders.js';

export default async function handler(req, res) {
  const raw = req.query?.path;
  const routePath =
    raw === undefined || raw === null ? '' : Array.isArray(raw) ? raw.join('/') : String(raw);
  const key = routePath.replace(/^\/+|\/+$/g, '');

  if (!key) {
    res.status(404).json({ error: 'missing_path' });
    return;
  }

  const load = routeLoaders[key];
  if (!load) {
    res.status(404).json({ error: 'unknown_route', path: key });
    return;
  }

  try {
    const mod = await load();
    const fn = mod?.default;
    if (typeof fn !== 'function') {
      res.status(500).json({ error: 'handler_not_loaded', path: key });
      return;
    }
    return await fn(req, res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'router_failed';
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
}
