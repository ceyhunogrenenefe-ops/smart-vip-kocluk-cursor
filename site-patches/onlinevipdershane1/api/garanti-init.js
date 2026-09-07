/**
 * Garanti BBVA — ödeme formu başlat
 *
 * 1) mode: 'raw_amount' + amountKurus → serbest tutar (koçluk paneli proxy)
 * 2) items[] katalog / kitapMagaza + amountKurus
 */
const { resolveLineItems } = require('./_lib/products');
const {
  garantiConfig,
  buildCommonPaymentFormFields,
  makeGarantiOrderId,
  clientIp,
} = require('./_lib/garanti');

function getOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cfg = garantiConfig();
  if (!cfg) {
    return res.status(500).json({
      error:
        'Garanti POS yapılandırılmamış. Vercel ortam değişkenlerine GARANTI_MERCHANT_ID, GARANTI_TERMINAL_ID, GARANTI_STORE_KEY ve GARANTI_PROVISION_PASSWORD ekleyin.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const customer = body.customer || {};
    const parentName = String(customer.parentName || customer.name || 'Online VIP').trim();
    const phone = String(customer.phone || '05000000000').trim();
    const email = String(customer.email || 'odeme@onlinevipdershane.com')
      .trim()
      .toLowerCase();

    const origin = getOrigin(req);
    const successUrl =
      String(body.successUrl || '').trim() || `${origin}/api/garanti-callback?result=ok`;
    const errorUrl =
      String(body.errorUrl || '').trim() || `${origin}/api/garanti-callback?result=fail`;

    let paymentAmount;
    const mode = String(body.mode || '').trim().toLowerCase();
    if (mode === 'raw_amount' || (body.amountKurus != null && !body.items)) {
      paymentAmount = parseInt(String(body.amountKurus), 10);
      if (!Number.isFinite(paymentAmount) || paymentAmount < 100) {
        return res.status(400).json({ error: 'Ödeme tutarı geçersiz.' });
      }
    } else {
      const resolved = resolveLineItems(body.items);
      paymentAmount = resolved.reduce((sum, row) => sum + row.unitAmount * row.qty, 0);
      if (paymentAmount < 100) {
        return res.status(400).json({ error: 'Ödeme tutarı geçersiz.' });
      }
    }

    const orderId = String(body.orderId || makeGarantiOrderId()).slice(0, 36);
    const fields = buildCommonPaymentFormFields({
      cfg,
      orderId,
      amountKurus: paymentAmount,
      successUrl,
      errorUrl,
      customerEmail: email,
      customerIp: body.customerIp || clientIp(req),
      installmentCount: 0,
      cardholderName: parentName,
    });

    return res.status(200).json({
      provider: 'garanti',
      gateway_url: cfg.gatewayUrl,
      action: cfg.gatewayUrl,
      fields,
      orderId,
      paymentAmount,
      mode: cfg.mode,
    });
  } catch (err) {
    console.error('garanti-init error', err);
    return res.status(400).json({ error: err.message || 'Garanti ödeme başlatılamadı.' });
  }
};
