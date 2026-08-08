const {
  garantiConfig,
  verifyCallbackHash,
  isGarantiPaymentApproved,
  normalizeCallbackParams,
} = require('./_lib/garanti');
const { createKommoLead } = require('./_lib/kommo');

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

async function notifyPanelPaid({ merchantOid, totalAmount }) {
  const url = process.env.KOCLUK_PANEL_URL;
  const secret = process.env.OZEL_DERS_WEBHOOK_SECRET;
  if (!url || !secret) return;
  await fetch(`${url.replace(/\/$/, '')}/api/ozel-ders-talepleri?op=webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({
      event: 'order_paid',
      merchant_oid: merchantOid,
      amount_kurus: Number(totalAmount) || null,
      provider: 'garanti',
      source: 'onlinevipdershane.com',
    }),
  });
}

const FORMSPREE_ID = process.env.FORMSPREE_FORM_ID || 'mpqnjdwd';

async function notifyPaidOrder({ merchantOid, totalAmount }) {
  const amountTl = (Number(totalAmount) / 100).toLocaleString('tr-TR') + ' ₺';
  const note = `Garanti POS ödeme başarılı · Sipariş ${merchantOid} · ${amountTl}`;

  try {
    await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form: 'garanti-odeme',
        merchant_oid: merchantOid,
        total: amountTl,
        _subject: `Yeni Garanti Ödemesi — ${merchantOid}`,
        program: 'Premium / Site Ödemesi',
        not: note,
      }),
    });
  } catch (err) {
    console.error('garanti-callback email', err);
  }

  try {
    await createKommoLead(
      {
        ad: 'Garanti',
        soyad: 'Ödeme',
        email: '',
        telefon: '',
        sinif: 'Ödeme',
        program: `Online Ödeme ${amountTl}`,
        not: note,
      },
      { tag: 'Garanti Ödeme' }
    );
  } catch (err) {
    console.error('garanti-callback kommo', err);
  }
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
  const amount = String(raw.txnamount || '').trim();

  const failUrl = `${origin}/odeme-iptal.html${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
  const okUrl = `${origin}/odeme-tamamlandi.html${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;

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

  console.log('garanti-callback: success', orderId, amount);
  notifyPaidOrder({ merchantOid: orderId, totalAmount: amount }).catch((err) =>
    console.error('garanti-callback notify', err)
  );
  notifyPanelPaid({ merchantOid: orderId, totalAmount: amount }).catch((err) =>
    console.warn('garanti-callback panel notify', err)
  );

  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(htmlRedirect(okUrl, 'Ödeme başarılı', 'Yönlendiriliyorsunuz…'));
};
