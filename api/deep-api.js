/**
 * `/api/google/...`, `/api/cron/...`, `/api/garanti-pos/...` —
 * Vite+Vercel’de çok segment bazen catch-all’a düşmez; rewrite ile buraya gelir.
 * `[[...segments]].js` ile aynı prefix eşlemesi (apiExtraSegments).
 */
import { routeLoaders } from './_route-loaders.js';
import { applyCors, handleCorsPreflight } from './_lib/cors-mobile.js';

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);

  const raw = req.query?.path;
  const routePath =
    raw === undefined || raw === null ? '' : Array.isArray(raw) ? raw.join('/') : String(raw);
  const key = routePath.replace(/^\/+|\/+$/g, '');

  if (!key) {
    res.status(404).json({ error: 'missing_path' });
    return;
  }

  const segments = key.split('/').filter(Boolean);
  let load = routeLoaders[key];
  let matched = key;
  let extraSegments = [];

  if (!load && segments.length > 1) {
    for (let i = segments.length - 1; i > 0; i -= 1) {
      const prefix = segments.slice(0, i).join('/');
      if (routeLoaders[prefix]) {
        load = routeLoaders[prefix];
        matched = prefix;
        extraSegments = segments.slice(i);
        break;
      }
    }
  }

  if (!load) {
    res.status(404).json({ error: 'unknown_route', path: key });
    return;
  }

  try {
    const mod = await load();
    const fn = mod?.default;
    if (typeof fn !== 'function') {
      res.status(500).json({ error: 'handler_not_loaded', path: matched });
      return;
    }
    req.apiExtraSegments = extraSegments;
    req.apiRoutePath = matched;
    return await fn(req, res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'router_failed';
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
}
