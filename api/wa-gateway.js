/**
 * HTTPS site → HTTP VPS: Vercel üzerinden WhatsApp gateway’e proxy.
 * vercel.json: /api/whatsapp-gateway/(.*) → /api/wa-gateway?tail=$1
 *
 * Ortam: WHATSAPP_GATEWAY_UPSTREAM=http://SUNUCU:4010 (sonunda / yok)
 */
import { resolveGatewayUpstream } from './_lib/gateway-upstream.js';

export default async function handler(req, res) {
  const upstream = resolveGatewayUpstream();
  const upstreamHost = upstream.replace(/^https?:\/\//i, '');
  const tailRaw = req.query?.tail;
  const tail =
    tailRaw === undefined || tailRaw === null
      ? ''
      : Array.isArray(tailRaw)
        ? tailRaw.join('/')
        : String(tailRaw);
  const pathPart = tail.replace(/^\/+/, '');

  if (!upstream) {
    res.status(503).json({
      ok: false,
      error: 'whatsapp_gateway_upstream_missing',
      hint:
        'Vercel env: WHATSAPP_GATEWAY_UPSTREAM=http://sunucu:4010 veya WHATSAPP_GATEWAY_URL ile doğrudan VPS adresi'
    });
    return;
  }

  const urlObj = new URL(req.url || '/', 'http://localhost.local');
  urlObj.searchParams.delete('tail');
  const qs = urlObj.search || '';
  const target = `${upstream}/${pathPart}${qs}`;

  /** @type {Record<string, string>} */
  const fwd = {};
  const auth = req.headers.authorization;
  if (auth) fwd.Authorization = Array.isArray(auth) ? auth[0] : auth;
  const ct = req.headers['content-type'];
  if (ct) fwd['Content-Type'] = Array.isArray(ct) ? ct[0] : ct;
  const gk =
    req.headers['x-gateway-key'] ||
    process.env.GATEWAY_API_KEY ||
    process.env.WHATSAPP_GATEWAY_KEY ||
    process.env.VITE_WHATSAPP_GATEWAY_KEY ||
    '';
  const gatewayKey = String(Array.isArray(gk) ? gk[0] : gk).trim();
  if (gatewayKey) fwd['x-gateway-key'] = gatewayKey;
  const strictHdr = req.headers['x-gateway-strict-session'];
  if (strictHdr) {
    fwd['x-gateway-strict-session'] = Array.isArray(strictHdr) ? strictHdr[0] : strictHdr;
  }

  const method = String(req.method || 'GET').toUpperCase();
  /** @type {RequestInit} */
  const init = { method, headers: fwd };

  if (method !== 'GET' && method !== 'HEAD') {
    fwd['Content-Type'] = fwd['Content-Type'] || 'application/json';
    if (req.body !== undefined && req.body !== null) {
      init.body =
        typeof req.body === 'string'
          ? req.body
          : Buffer.isBuffer(req.body)
            ? req.body
            : JSON.stringify(req.body);
    }
  }

  const isSendRoute = /\/send(?:-document)?\/?$/i.test(pathPart);
  const isStatusRoute = /\/status\/?$/i.test(pathPart);
  const timeoutMs = isSendRoute
    ? Math.min(115000, Math.max(25000, Number(process.env.WA_GATEWAY_SEND_TIMEOUT_MS) || 110000))
    : Math.min(45000, Math.max(10000, Number(process.env.WA_GATEWAY_STATUS_TIMEOUT_MS) || 30000));

  const fetchOnce = async () => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(target, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(tid);
    }
  };

  try {
    let r = await fetchOnce();
    const canRetry =
      method === 'GET' ||
      method === 'HEAD' ||
      isStatusRoute ||
      (isSendRoute && (r.status === 409 || r.status === 502 || r.status === 504));
    if (canRetry && (r.status === 409 || r.status === 502 || r.status === 504)) {
      await new Promise((resolve) => setTimeout(resolve, isSendRoute ? 900 : 200));
      r = await fetchOnce();
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const outCt = r.headers.get('content-type');
    if (outCt) res.setHeader('Content-Type', outCt);
    res.status(r.status).send(buf);
  } catch (e) {
    const aborted =
      (e instanceof Error && e.name === 'AbortError') ||
      (typeof e === 'object' &&
        e !== null &&
        /** @type {{ code?: string }} */ (e).code === 'ABORT_ERR');
    if (aborted) {
      res.status(504).json({
        ok: false,
        error: 'gateway_upstream_timeout',
        upstream: upstreamHost,
        detail: `${timeoutMs}ms`,
        hint:
          'VPS/WhatsApp gateway bu sürede yanıt vermedi. Sunucu erişimi (WHATSAPP_GATEWAY_UPSTREAM), pm2, firewall ve gateway sürecini kontrol edin; Vercel Pro’da wa-gateway maxDuration artırılabilir.'
      });
      return;
    }
    const msg = e instanceof Error && e.message ? e.message.slice(0, 180) : 'proxy_failed';
    res.status(502).json({
      ok: false,
      error: 'gateway_upstream_unreachable',
      upstream: upstreamHost,
      detail: msg,
      hint:
        'Upstream’a bağlanılamadı (ağ/DNS/firewall). WHATSAPP_GATEWAY_UPSTREAM adresini, gateway sürecinin o makinede çalıştığını ve 4010 erişimini doğrulayın.'
    });
  }
}
