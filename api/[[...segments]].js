/**
 * Vercel + Vite: çoğu projede bu dosya **tek segment** `/api/foo` için çalışır.
 * `/api/google/...`, `/api/cron/...`, `/api/meta/...`, `/api/whatsapp/...` → `vercel.json` + `deep-api.js`
 * `/api/whatsapp-gateway/...` → `vercel.json` + `wa-gateway.js`
 */

import { routeLoaders } from './_route-loaders.js';
import { applyCors, handleCorsPreflight } from './_lib/cors-mobile.js';

function segmentsFromReq(req) {
  const raw = req.query?.segments;
  let segments =
    raw === undefined || raw === null ? [] : Array.isArray(raw) ? [...raw] : [String(raw)];
  segments = segments.map(String).filter(Boolean);
  if (segments.length === 0 && typeof req.url === 'string') {
    try {
      const pathOnly = req.url.split('?')[0] || '';
      const trimmed = pathOnly.replace(/^.*\/api\/?/i, '').replace(/^\/+|\/+$/g, '');
      if (trimmed) segments = trimmed.split('/').filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return segments;
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);

  const segments = segmentsFromReq(req);
  let routePath = segments.join('/');
  let load = routeLoaders[routePath];
  let extraSegments = [];

  if (!load && segments.length > 1) {
    for (let i = segments.length - 1; i > 0; i -= 1) {
      const prefix = segments.slice(0, i).join('/');
      if (routeLoaders[prefix]) {
        load = routeLoaders[prefix];
        routePath = prefix;
        extraSegments = segments.slice(i);
        break;
      }
    }
  }

  if (!routePath) {
    res.status(404).json({ error: 'missing_path', hint: '/api/auth-login · /api/students · …' });
    return;
  }

  if (!load) {
    res.status(404).json({ error: 'unknown_route', path: routePath });
    return;
  }

  try {
    const mod = await load();
    const fn = mod?.default;
    if (typeof fn !== 'function') {
      res.status(500).json({ error: 'handler_not_loaded', path: routePath });
      return;
    }
    req.apiExtraSegments = extraSegments;
    return await fn(req, res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'router_failed';
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
}
