/**
 * Public: onlinevipdershane.com form / reklam formu → CRM
 * POST /api/site-leads
 * GET  /api/site-leads?op=ping
 *
 * CORS: SITE_LEAD_CORS_ORIGIN (yoksa onlinevipdershane.com)
 * İsteğe bağlı sunucu gizli anahtarı: SITE_LEAD_WEBHOOK_SECRET
 *   — tarayıcı (izinli Origin) secretsız kabul edilir
 *   — Origin yoksa (site API → panel) secret varsa doğrulanır
 */
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  ingestSiteLead,
  isAllowedSiteLeadOrigin,
  isSiteLeadHoneypot,
  siteLeadOrigins
} from '../api/_lib/site-leads.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function applyCors(req, res) {
  const allowed = siteLeadOrigins();
  const origin = String(req.headers.origin || '').trim();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', allowed[0] || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-webhook-secret, x-site-lead-secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

function secretMatches(req) {
  const secret = String(
    process.env.SITE_LEAD_WEBHOOK_SECRET || process.env.OZEL_DERS_WEBHOOK_SECRET || ''
  ).trim();
  if (!secret) return null;
  const hdr = String(
    req.headers['x-site-lead-secret'] || req.headers['x-webhook-secret'] || req.headers.authorization || ''
  )
    .replace(/^Bearer\s+/i, '')
    .trim();
  return hdr === secret;
}

function authorize(req) {
  const origin = String(req.headers.origin || '').trim();
  if (origin) return isAllowedSiteLeadOrigin(origin);
  const secretCheck = secretMatches(req);
  if (secretCheck === true) return true;
  if (secretCheck === false) return false;
  // Secret tanımlı değil + Origin yok: site serverless dual-write
  return true;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const op = String(req.query?.op || '').trim();
    if (op && op !== 'ping') return res.status(400).json({ error: 'unknown_op' });
    return res.status(200).json({
      ok: true,
      website_form: true,
      endpoint: '/api/site-leads',
      origins: siteLeadOrigins().filter((o) => !/localhost|127\.0\.0\.1/.test(o))
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!authorize(req)) return res.status(403).json({ error: 'origin_not_allowed' });

  const body = parseBody(req);
  if (isSiteLeadHoneypot(body)) {
    return res.status(200).json({ ok: true, received: true });
  }

  try {
    const result = await ingestSiteLead(body);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error || 'invalid' });
    }
    return res.status(200).json({
      ok: true,
      received: true,
      skipped: result.skipped || false,
      lead_id: result.lead_id || null
    });
  } catch (e) {
    console.warn('[site-leads]', errorMessage(e));
    return res.status(500).json({ error: 'site_lead_failed' });
  }
}
