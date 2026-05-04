/**
 * HTTPS site → HTTP VPS: Vercel üzerinden WhatsApp gateway’e proxy.
 * vercel.json: /api/whatsapp-gateway/(.*) → /api/wa-gateway?tail=$1
 *
 * Ortam: WHATSAPP_GATEWAY_UPSTREAM=http://SUNUCU:4010 (sonunda / yok)
 */
function resolveGatewayUpstream() {
  const primary = String(process.env.WHATSAPP_GATEWAY_UPSTREAM || '').trim().replace(/\/$/, '');
  if (primary) return primary;
  /** Tek değişkenle kurulum: doğrudan VPS http(s) adresi (Vercel alan adı değil). */
  const alt = String(process.env.WHATSAPP_GATEWAY_URL || '').trim().replace(/\/$/, '');
  if (alt && /^https?:\/\//i.test(alt) && !/vercel\.app/i.test(alt)) return alt;
  return '';
}

export default async function handler(req, res) {
  const upstream = resolveGatewayUpstream();
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

  const qs = new URL(req.url || '/', 'http://localhost.local').search || '';
  const target = `${upstream}/${pathPart}${qs}`;

  /** @type {Record<string, string>} */
  const fwd = {};
  const auth = req.headers.authorization;
  if (auth) fwd.Authorization = Array.isArray(auth) ? auth[0] : auth;
  const ct = req.headers['content-type'];
  if (ct) fwd['Content-Type'] = Array.isArray(ct) ? ct[0] : ct;
  const gk = req.headers['x-gateway-key'];
  if (gk) fwd['x-gateway-key'] = Array.isArray(gk) ? gk[0] : String(gk);

  const method = String(req.method || 'GET').toUpperCase();
  /** @type {RequestInit} */
  const init = { method, headers: fwd };

  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined && req.body !== null) {
    fwd['Content-Type'] = fwd['Content-Type'] || 'application/json';
    init.body =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body);
  }

  const timeoutMs = Math.min(
    115000,
    Math.max(8000, Number(process.env.WA_GATEWAY_FETCH_TIMEOUT_MS) || 115000)
  );
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(target, { ...init, signal: controller.signal });
    clearTimeout(tid);
    const buf = Buffer.from(await r.arrayBuffer());
    const outCt = r.headers.get('content-type');
    if (outCt) res.setHeader('Content-Type', outCt);
    res.status(r.status).send(buf);
  } catch (e) {
    clearTimeout(tid);
    const aborted =
      (e instanceof Error && e.name === 'AbortError') ||
      (typeof e === 'object' &&
        e !== null &&
        /** @type {{ code?: string }} */ (e).code === 'ABORT_ERR');
    if (aborted) {
      res.status(504).json({
        ok: false,
        error: 'gateway_upstream_timeout',
        detail: `${timeoutMs}ms`,
        hint:
          'VPS/WhatsApp gateway bu sürede yanıt vermedi. Sunucu erişimi (WHATSAPP_GATEWAY_UPSTREAM), pm2, firewall ve gateway sürecini kontrol edin; Vercel Pro’da wa-gateway maxDuration artırılabilir.'
      });
      return;
    }
    const msg = e instanceof Error ? e.message : 'proxy_failed';
    res.status(502).json({
      ok: false,
      error: msg,
      hint: 'Upstream’a bağlanılamadı (ağ/DNS). WHATSAPP_GATEWAY_UPSTREAM adresini doğrulayın.'
    });
  }
}
