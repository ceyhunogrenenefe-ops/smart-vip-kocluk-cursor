/**
 * Kitap siparişi — PayTR / Garanti başlat (odeme/kitap sayfasının beklediği yanıt).
 */
import {
  buildPaytrToken,
  buildUserBasketFromLines,
  clientIp,
  makeMerchantOid,
  paytrConfig,
  paytrEnvCheck,
} from './paytr.js';
import {
  buildCommonPaymentFormFields,
  getGarantiConfig,
  publicAppBaseUrl,
} from './garanti-pos.js';
import { paymentRefFromOrderId } from './commerce-checkout-token.js';

const SITE_PAYTR_URL = 'https://onlinevipdershane.com/api/paytr-token';
const SITE_GARANTI_URL = 'https://onlinevipdershane.com/api/garanti-init';

function siteOkUrl(req) {
  return `${publicAppBaseUrl(req).replace(/\/$/, '')}/kitap-magazasi`;
}

function siteFailUrl(req) {
  return `${publicAppBaseUrl(req).replace(/\/$/, '')}/sepet`;
}

function basketLines(order) {
  const items = order.commerce_order_items || order.items || [];
  if (!items.length) {
    return [{ name: 'Kitap Mağazası Siparişi', unitKurus: order.total_kurus, qty: 1 }];
  }
  return items.map((it) => ({
    name: String(it.title_snapshot || it.title || 'Kitap').slice(0, 120),
    unitKurus: Number(it.unit_price_kurus || it.unit_kurus || 0),
    qty: Math.max(1, Number(it.quantity || it.qty) || 1),
  }));
}

async function trySitePaytr(customer, amountKurus) {
  try {
    const res = await fetch(SITE_PAYTR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'kitapMagaza', qty: 1, amountKurus }],
        customer,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      return { ok: false, error: data.error || `site_paytr_${res.status}` };
    }
    return { ok: true, token: data.token };
  } catch (e) {
    return { ok: false, error: e?.message || 'site_paytr_failed' };
  }
}

async function trySiteGaranti(customer, amountKurus) {
  try {
    const res = await fetch(SITE_GARANTI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'kitapMagaza', qty: 1, amountKurus }],
        customer,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.action || !data.fields) {
      return { ok: false, error: data.error || `site_garanti_${res.status}` };
    }
    return { ok: true, action: data.action, fields: data.fields };
  } catch (e) {
    return { ok: false, error: e?.message || 'site_garanti_failed' };
  }
}

async function startLocalPaytr(req, customer, order) {
  const cfg = paytrConfig();
  if (!cfg) return { ok: false, error: 'paytr_not_configured', missing: paytrEnvCheck().missing };

  const amountKurus = Number(order.total_kurus) || 0;
  const userBasket = buildUserBasketFromLines(basketLines(order));
  const merchantOid = paymentRefFromOrderId(order.id) || makeMerchantOid('KTP');
  const userIp = clientIp(req);

  const paytr_token = buildPaytrToken({
    merchantId: cfg.merchantId,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
    userIp,
    merchantOid,
    email: customer.email,
    paymentAmount: amountKurus,
    userBasket,
    testMode: cfg.testMode,
  });

  const form = new URLSearchParams({
    merchant_id: cfg.merchantId,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email: customer.email,
    payment_amount: String(amountKurus),
    paytr_token,
    user_basket: userBasket,
    debug_on: cfg.testMode ? '1' : '0',
    no_installment: '0',
    max_installment: '0',
    user_name: String(customer.parentName || customer.name || '').slice(0, 60),
    user_address: 'Türkiye',
    user_phone: String(customer.phone || '').replace(/\D/g, '').slice(0, 20),
    merchant_ok_url: siteOkUrl(req),
    merchant_fail_url: siteFailUrl(req),
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
    return { ok: false, error: paytrJson.reason || paytrJson.err_msg || 'PayTR token alınamadı' };
  }
  return { ok: true, token: paytrJson.token };
}

function startLocalGaranti(req, customer, order) {
  const cfg = getGarantiConfig();
  if (!cfg.configured) return { ok: false, error: 'garanti_not_configured', missing: cfg.missing };
  const orderId = paymentRefFromOrderId(order.id);
  const fields = buildCommonPaymentFormFields({
    cfg,
    orderId,
    amountKurus: order.total_kurus,
    successUrl: siteOkUrl(req),
    errorUrl: siteFailUrl(req),
    customerEmail: customer.email,
    customerIp: clientIp(req),
    cardholderName: customer.parentName || customer.name,
  });
  return { ok: true, action: cfg.gatewayUrl, fields };
}

/**
 * @returns {{ provider: 'paytr', token: string } | { provider: 'garanti', action: string, fields: object }}
 */
export async function startCommerceProviderPayment(req, order, customer, providerHint) {
  const amountKurus = Number(order.total_kurus) || 0;
  if (amountKurus < 100) throw new Error('Ödeme tutarı geçersiz');
  const prefer = String(providerHint || 'paytr').toLowerCase() === 'garanti' ? 'garanti' : 'paytr';
  const cust = {
    parentName: customer.name || customer.parentName,
    name: customer.name || customer.parentName,
    email: customer.email,
    phone: customer.phone,
    studentInfo: customer.notes || '',
  };

  if (prefer === 'garanti') {
    const siteG = await trySiteGaranti(cust, amountKurus);
    if (siteG.ok) return { provider: 'garanti', action: siteG.action, fields: siteG.fields };
    const localG = startLocalGaranti(req, cust, order);
    if (localG.ok) return { provider: 'garanti', action: localG.action, fields: localG.fields };
    const siteP = await trySitePaytr(cust, amountKurus);
    if (siteP.ok) return { provider: 'paytr', token: siteP.token };
    const localP = await startLocalPaytr(req, cust, order);
    if (localP.ok) return { provider: 'paytr', token: localP.token };
    throw new Error(siteG.error || localG.error || 'Garanti ödeme formu alınamadı');
  }

  const siteP = await trySitePaytr(cust, amountKurus);
  if (siteP.ok) return { provider: 'paytr', token: siteP.token };
  const localP = await startLocalPaytr(req, cust, order);
  if (localP.ok) return { provider: 'paytr', token: localP.token };
  const siteG = await trySiteGaranti(cust, amountKurus);
  if (siteG.ok) return { provider: 'garanti', action: siteG.action, fields: siteG.fields };
  const localG = startLocalGaranti(req, cust, order);
  if (localG.ok) return { provider: 'garanti', action: localG.action, fields: localG.fields };
  throw new Error(siteP.error || localP.error || 'PayTR token alınamadı');
}
