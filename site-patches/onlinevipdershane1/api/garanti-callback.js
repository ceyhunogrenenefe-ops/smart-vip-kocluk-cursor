const {
  garantiConfig,
  verifyCallbackHash,
  isGarantiPaymentApproved,
  normalizeCallbackParams,
} = require('./_lib/garanti');

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return { ...b };
  if (typeof b === 'string' && b.includes('=')) {
    return Object.fromEntries(new URLSearchParams(b));
  }
  return {};
}

function getOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function htmlRedirect(url, title, message) {
  const safeUrl = String(url).replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0;url=${safeUrl}"/><title>${title}</title></head><body><p>${message}</p><p><a href="${safeUrl}">Devam et</a></p><script>location.replace(${JSON.stringify(url)});</script></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).send('ERR');
  }

  const cfg = garantiConfig();
  const origin = getOrigin(req);
  const raw = {
    ...normalizeCallbackParams(parseBody(req)),
    ...normalizeCallbackParams(req.query || {}),
  };
  const orderId = String(raw.orderid || raw.oid || '').trim();
  const source = String(req.query?.source || raw.source || '').trim();

  const failUrl =
    source === 'kitap'
      ? `${origin}/odeme-iptal.html?source=kitap${orderId ? `&order=${encodeURIComponent(orderId)}` : ''}`
      : `${origin}/odeme-iptal.html${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
  const okUrl =
    source === 'kitap'
      ? `${origin}/odeme-tamamlandi.html?source=kitap${orderId ? `&order=${encodeURIComponent(orderId)}` : ''}`
      : `${origin}/odeme-tamamlandi.html${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;

  if (!cfg || !orderId) {
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlRedirect(failUrl, 'Ödeme başarısız', 'Yönlendiriliyorsunuz…'));
  }

  const hashOk = verifyCallbackHash(raw, cfg.storeKey);
  const approved = isGarantiPaymentApproved(raw);
  const treatSuccess = approved && (hashOk || String(raw.response || '').toLowerCase() === 'approved');

  if (!treatSuccess) {
    console.log('garanti-callback: failed', orderId, raw.mdstatus, raw.procreturncode);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlRedirect(failUrl, 'Ödeme başarısız', 'Yönlendiriliyorsunuz…'));
  }

  console.log('garanti-callback: success', orderId);
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(htmlRedirect(okUrl, 'Ödeme başarılı', 'Yönlendiriliyorsunuz…'));
};
