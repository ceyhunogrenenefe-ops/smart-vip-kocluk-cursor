/**
 * Kitap mağazası checkout köprüsü (koçluk paneli → PayTR / Garanti)
 * POST { op: 'resolve' | 'apply_coupon' | 'pay', token, coupon_code?, customer?, address?, provider? }
 */
const {
  paytrConfig,
  buildUserBasket,
  buildPaytrToken,
  clientIp: paytrClientIp,
} = require('./_lib/paytr');
const {
  garantiConfig,
  buildCommonPaymentForm,
  clientIp: garantiClientIp,
} = require('./_lib/garanti');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function panelBase() {
  return String(process.env.KOCLUK_PANEL_URL || '')
    .trim()
    .replace(/\/$/, '');
}

function webhookSecret() {
  return (
    String(process.env.COMMERCE_CHECKOUT_SECRET || '').trim() ||
    String(process.env.OZEL_DERS_WEBHOOK_SECRET || '').trim()
  );
}

async function panelCommerce(op, payload) {
  const base = panelBase();
  if (!base) throw new Error('KOCLUK_PANEL_URL yapılandırılmamış');
  const headers = { 'Content-Type': 'application/json' };
  const secret = webhookSecret();
  if (secret && (op === 'order.paid' || op.startsWith('checkout.'))) {
    headers['x-webhook-secret'] = secret;
  }
  const res = await fetch(`${base}/api/commerce-store`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ op, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Panel ${op} başarısız`);
  }
  return data;
}

function formatTry(kurus) {
  return (Number(kurus) / 100).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  });
}

function basketFromOrder(order) {
  const items = order.items || [];
  const rows = items.map((it) => ({
    product: {
      id: it.id || 'kitap',
      name: String(it.title_snapshot || 'Kitap').slice(0, 80),
      price: Number(it.unit_price_kurus || 0) / 100,
    },
    qty: Math.max(1, Number(it.quantity) || 1),
    unitAmount: Number(it.unit_price_kurus || 0),
  }));
  const shipping = Number(order.shipping_kurus || 0);
  const discount = Number(order.discount_kurus || 0);
  if (shipping > 0) {
    rows.push({
      product: { id: 'kargo', name: 'Kargo', price: shipping / 100 },
      qty: 1,
      unitAmount: shipping,
    });
  }
  if (discount > 0) {
    // PayTR sepet tutarı payment_amount ile uyumlu kalsın diye negatif satır yerine
    // indirimi son üründen düşmek yerine tek satır "İndirim" 0 fiyat + tutarı total'da tutuyoruz.
    // En güvenlisi: tek satır toplam.
  }
  const basketSum = rows.reduce((s, r) => s + r.unitAmount * r.qty, 0);
  const total = Number(order.total_kurus || 0);
  if (basketSum !== total && total > 0) {
    return [
      {
        product: {
          id: order.order_number || 'siparis',
          name: `Kitap siparişi ${order.order_number || ''}`.trim().slice(0, 80),
          price: total / 100,
        },
        qty: 1,
        unitAmount: total,
      },
    ];
  }
  return rows;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const op = String(body.op || 'resolve').trim();
    const token = String(body.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token gerekli' });

    if (op === 'resolve') {
      const data = await panelCommerce('checkout.resolve', { token });
      return res.status(200).json({
        ok: true,
        order: data.order,
        total_label: formatTry(data.order.total_kurus),
      });
    }

    if (op === 'apply_coupon' || op === 'checkout.apply_coupon') {
      const couponCode = String(body.coupon_code || body.code || '').trim();
      const data = await panelCommerce('checkout.apply_coupon', {
        token,
        coupon_code: couponCode,
      });
      return res.status(200).json({
        ok: true,
        order: data.order,
        total_label: formatTry(data.order && data.order.total_kurus),
      });
    }

    if (op === 'pay') {
      const customer = body.customer || {};
      const parentName = String(customer.parentName || '').trim();
      const phone = String(customer.phone || '').trim();
      const email = String(customer.email || '').trim().toLowerCase();
      const studentInfo = String(customer.studentInfo || '').trim();

      if (!parentName || parentName.length < 3) {
        return res.status(400).json({ error: 'Veli adı soyadı en az 3 karakter olmalıdır.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
      }
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'Geçerli bir telefon numarası girin.' });
      }

      const updated = await panelCommerce('checkout.update_customer', {
        token,
        customer_name: parentName,
        customer_email: email,
        customer_phone: phone,
        notes: studentInfo,
        address: body.address || {},
      });

      const order = updated.order;
      const paymentAmount = Number(order.total_kurus);
      const merchantOid = String(updated.payment_ref || '');
      if (!merchantOid || paymentAmount < 100) {
        return res.status(400).json({ error: 'Ödeme tutarı veya sipariş referansı geçersiz.' });
      }

      const provider = String(body.provider || 'paytr').toLowerCase();
      const origin = getOrigin(req);
      const basketRows = basketFromOrder(order);

      if (provider === 'garanti') {
        const cfg = garantiConfig();
        if (!cfg) {
          return res.status(500).json({
            error:
              'Garanti Bonus POS yapılandırılmamış. Vercel ortam değişkenlerine GARANTI_* ekleyin.',
          });
        }
        const form = buildCommonPaymentForm({
          cfg,
          orderId: merchantOid.slice(0, 36),
          amountKurus: paymentAmount,
          email,
          userIp: garantiClientIp(req),
          successUrl: `${origin}/api/garanti-callback?result=ok&source=kitap`,
          errorUrl: `${origin}/api/garanti-callback?result=fail&source=kitap`,
          installmentCount: String(body.installment || '').replace(/\D/g, ''),
          lang: 'tr',
        });
        return res.status(200).json({
          ok: true,
          provider: 'garanti',
          orderId: merchantOid,
          paymentAmount,
          action: form.action,
          fields: form.fields,
          mode: cfg.mode,
        });
      }

      const cfg = paytrConfig();
      if (!cfg) {
        return res.status(500).json({
          error:
            'PayTR yapılandırılmamış. Vercel ortam değişkenlerine PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY ve PAYTR_MERCHANT_SALT ekleyin.',
        });
      }

      const userBasket = buildUserBasket(basketRows);
      const userIp = paytrClientIp(req);
      const paytr_token = buildPaytrToken({
        merchantId: cfg.merchantId,
        merchantKey: cfg.merchantKey,
        merchantSalt: cfg.merchantSalt,
        userIp,
        merchantOid,
        email,
        paymentAmount,
        userBasket,
        testMode: cfg.testMode,
      });

      const form = new URLSearchParams({
        merchant_id: cfg.merchantId,
        user_ip: userIp,
        merchant_oid: merchantOid,
        email,
        payment_amount: String(paymentAmount),
        paytr_token,
        user_basket: userBasket,
        debug_on: cfg.testMode ? '1' : '0',
        no_installment: '0',
        max_installment: '0',
        user_name: parentName.slice(0, 60),
        user_address: 'Türkiye',
        user_phone: phone.replace(/\D/g, '').slice(0, 20),
        merchant_ok_url: `${origin}/odeme-tamamlandi.html?source=kitap`,
        merchant_fail_url: `${origin}/odeme-iptal.html?source=kitap`,
        timeout_limit: '30',
        currency: 'TL',
        test_mode: String(cfg.testMode),
        lang: 'tr',
      });

      const paytrRes = await fetch('https://www.paytr.com/odeme/api/get-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const paytrJson = await paytrRes.json().catch(() => ({}));
      if (paytrJson.status !== 'success' || !paytrJson.token) {
        const reason = paytrJson.reason || paytrJson.err_msg || 'PayTR token alınamadı';
        return res.status(400).json({ error: reason });
      }

      return res.status(200).json({
        ok: true,
        provider: 'paytr',
        token: paytrJson.token,
        merchantOid,
        paymentAmount,
      });
    }

    return res.status(400).json({ error: `Bilinmeyen op: ${op}` });
  } catch (err) {
    console.error('[commerce-checkout]', err);
    return res.status(400).json({ error: err.message || 'Checkout hatası' });
  }
};
