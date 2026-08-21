/**
 * /api/commerce-checkout-start — Kitap sepeti ödemeyi başlat (PayTR / Garanti)
 *
 * 1) onlinevipdershane.com PayTR (kitapMagaza) dene
 * 2) Yerel PAYTR_* env varsa PayTR token üret
 * 3) Yerel GARANTI_* varsa Garanti ödeme linki üret
 */

import crypto from 'crypto';
import { requireAuth } from '../api/_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../api/_lib/cors-mobile.js';
import {
  buildPaytrToken,
  buildUserBasketFromLines,
  clientIp,
  makeMerchantOid,
  paytrConfig,
  paytrEnvCheck,
} from '../api/_lib/paytr.js';
import { getGarantiConfig, kurusToTry, publicAppBaseUrl } from '../api/_lib/garanti-pos.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const SITE_PAYTR_URL = 'https://onlinevipdershane.com/api/paytr-token';
const SITE_GARANTI_URL = 'https://onlinevipdershane.com/api/garanti-init';

function err(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function orderIdFromToken(prefix = 'KTP') {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${t}${r}`.slice(0, 36);
}

function schemaMissing(msg) {
  return /commerce_checkout_handoffs|garanti_payment_orders|does not exist|schema cache|PGRST205/i.test(
    String(msg || '')
  );
}

async function loadHandoff(token) {
  const { data, error } = await supabaseAdmin
    .from('commerce_checkout_handoffs')
    .select('token, user_id, payload, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const expiresAt = new Date(data.expires_at);
  if (Number.isNaN(+expiresAt) || expiresAt.getTime() < Date.now()) return null;
  if (data.consumed_at) return null;
  return data;
}

async function markConsumed(token) {
  await supabaseAdmin
    .from('commerce_checkout_handoffs')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', token);
}

function buildBasketLines(payload) {
  const items = payload?.items || [];
  if (!items.length) {
    return [{ name: 'Kitap Mağazası Siparişi', unitKurus: payload.total_kurus, qty: 1 }];
  }
  return items.map((it) => ({
    name: String(it.title || 'Kitap').slice(0, 120),
    unitKurus: Number(it.unit_kurus) || 0,
    qty: Math.max(1, Number(it.qty) || 1),
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
    return { ok: true, token: data.token, merchantOid: data.merchantOid, paymentAmount: data.paymentAmount };
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
    return { ok: true, gateway_url: data.action, fields: data.fields, orderId: data.orderId };
  } catch (e) {
    return { ok: false, error: e?.message || 'site_garanti_failed' };
  }
}

async function startLocalPaytr(req, customer, payload) {
  const cfg = paytrConfig();
  if (!cfg) return { ok: false, error: 'paytr_not_configured', missing: paytrEnvCheck().missing };

  const amountKurus = parseInt(String(payload.total_kurus || '0'), 10);
  const lines = buildBasketLines(payload);
  const userBasket = buildUserBasketFromLines(lines);
  const merchantOid = makeMerchantOid('KTP');
  const userIp = clientIp(req);
  const origin = publicAppBaseUrl(req);

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
    user_name: customer.parentName.slice(0, 60),
    user_address: 'Türkiye',
    user_phone: customer.phone.replace(/\D/g, '').slice(0, 20),
    merchant_ok_url: `${origin}/odeme/sonuc?status=ok&order=${encodeURIComponent(merchantOid)}`,
    merchant_fail_url: `${origin}/odeme/sonuc?status=fail&order=${encodeURIComponent(merchantOid)}`,
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
  return { ok: true, token: paytrJson.token, merchantOid, paymentAmount: amountKurus };
}

async function startLocalGaranti(req, actor, customer, payload) {
  const cfg = getGarantiConfig();
  if (!cfg.configured) {
    return { ok: false, error: 'garanti_not_configured', missing: cfg.missing };
  }

  const amountKurus = parseInt(String(payload.total_kurus || '0'), 10);
  const publicToken = randomToken(24);
  const orderId = orderIdFromToken();
  const first = (payload.items || [])[0];
  const title = first?.title
    ? `Kitap Mağazası — ${first.title}${payload.items.length > 1 ? ` +${payload.items.length - 1}` : ''}`
    : 'Kitap Mağazası Siparişi';

  const row = {
    order_id: orderId,
    public_token: publicToken,
    institution_id: actor.institution_id || null,
    student_payment_record_id: null,
    title: String(title).slice(0, 200),
    amount_kurus: amountKurus,
    currency: 'TRY',
    installment_max: 0,
    customer_name: customer.parentName,
    customer_email: customer.email,
    customer_phone: customer.phone,
    status: 'pending',
    created_by: actor.sub || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: order, error: insertErr } = await supabaseAdmin
    .from('garanti_payment_orders')
    .insert(row)
    .select('*')
    .single();

  if (insertErr) {
    if (schemaMissing(insertErr.message)) {
      return { ok: false, error: 'garanti_payment_orders tablosu kurulmadı.' };
    }
    return { ok: false, error: insertErr.message || 'Ödeme kaydı oluşturulamadı.' };
  }

  const base = publicAppBaseUrl(req);
  return {
    ok: true,
    pay_url: `${base}/odeme/${publicToken}`,
    order_id: order.order_id,
    amount_try: kurusToTry(amountKurus),
  };
}

async function createStart(req, res) {
  let actor;
  try {
    actor = requireAuth(req);
  } catch {
    return err(res, 401, 'Giriş gerekli.');
  }
  if (!actor?.sub || actor.sub === 'anonymous') {
    return err(res, 401, 'Giriş gerekli.');
  }

  const body = parseBody(req);
  const handoffToken = String(body.handoff_token || body.token || '').trim();
  if (!handoffToken || handoffToken.length < 16) {
    return err(res, 400, 'Geçersiz ödeme oturumu.');
  }

  let handoff;
  try {
    handoff = await loadHandoff(handoffToken);
  } catch (e) {
    if (schemaMissing(e?.message)) {
      return err(res, 503, 'Ödeme aktarım tablosu kurulmadı. SQL migration çalıştırın.');
    }
    throw e;
  }
  if (!handoff) {
    return err(res, 410, 'Ödeme oturumu bulunamadı veya süresi doldu.');
  }
  if (handoff.user_id && actor.sub && handoff.user_id !== actor.sub) {
    return err(res, 403, 'Bu ödeme oturumu size ait değil.');
  }

  const payload = handoff.payload || {};
  const amountKurus = parseInt(String(payload.total_kurus || '0'), 10);
  if (!Number.isFinite(amountKurus) || amountKurus < 100) {
    return err(res, 400, 'Geçersiz ödeme tutarı.');
  }

  const parentName = String(body.parentName || body.customer_name || '').trim().slice(0, 120);
  const email = String(body.email || body.customer_email || '').trim().slice(0, 120).toLowerCase();
  const phone = String(body.phone || body.customer_phone || '').trim().slice(0, 40);
  const studentInfo = String(body.studentInfo || body.student_info || '').trim().slice(0, 300);
  if (!parentName || !email || !phone) {
    return err(res, 400, 'Veli adı, telefon ve e-posta zorunludur.');
  }

  const customer = { parentName, email, phone, studentInfo };
  const attempts = [];

  // 1) Site PayTR (kitapMagaza yaması varsa)
  const sitePaytr = await trySitePaytr(customer, amountKurus);
  attempts.push({ provider: 'site_paytr', ok: sitePaytr.ok, error: sitePaytr.error });
  if (sitePaytr.ok) {
    await markConsumed(handoffToken);
    return res.status(200).json({
      ok: true,
      method: 'paytr',
      token: sitePaytr.token,
      redirect_url: `https://www.paytr.com/odeme/guvenli/${encodeURIComponent(sitePaytr.token)}`,
      paymentAmount: sitePaytr.paymentAmount,
    });
  }

  // 2) Yerel PayTR
  const localPaytr = await startLocalPaytr(req, customer, payload);
  attempts.push({ provider: 'local_paytr', ok: localPaytr.ok, error: localPaytr.error });
  if (localPaytr.ok) {
    await markConsumed(handoffToken);
    return res.status(200).json({
      ok: true,
      method: 'paytr',
      token: localPaytr.token,
      redirect_url: `https://www.paytr.com/odeme/guvenli/${encodeURIComponent(localPaytr.token)}`,
      paymentAmount: localPaytr.paymentAmount,
    });
  }

  // 3) Site Garanti
  const siteGaranti = await trySiteGaranti(customer, amountKurus);
  attempts.push({ provider: 'site_garanti', ok: siteGaranti.ok, error: siteGaranti.error });
  if (siteGaranti.ok) {
    await markConsumed(handoffToken);
    return res.status(200).json({
      ok: true,
      method: 'garanti_form',
      gateway_url: siteGaranti.gateway_url,
      fields: siteGaranti.fields,
      order_id: siteGaranti.orderId,
    });
  }

  // 4) Yerel Garanti link
  const localGaranti = await startLocalGaranti(req, actor, customer, payload);
  attempts.push({ provider: 'local_garanti', ok: localGaranti.ok, error: localGaranti.error });
  if (localGaranti.ok) {
    await markConsumed(handoffToken);
    return res.status(200).json({
      ok: true,
      method: 'garanti_link',
      pay_url: localGaranti.pay_url,
      order_id: localGaranti.order_id,
      amount_try: localGaranti.amount_try,
    });
  }

  const missingPaytr = paytrEnvCheck().missing;
  const missingGaranti = getGarantiConfig().missing;
  return err(res, 503, 'Ödeme sistemi yapılandırılmamış veya site ürün kataloğu güncel değil.', {
    hint:
      'Vercel (smart-kocluk-ceyhu) içine PAYTR_MERCHANT_ID / KEY / SALT ekleyin, veya onlinevipdershane.com api/_lib/products.js içine kitapMagaza ekleyip redeploy edin.',
    missing_paytr: missingPaytr,
    missing_garanti: missingGaranti,
    attempts,
  });
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);
  try {
    if (req.method === 'POST') return createStart(req, res);
    res.setHeader('Allow', 'POST, OPTIONS');
    return err(res, 405, 'Method not allowed');
  } catch (e) {
    console.error('[commerce-checkout-start]', e?.message || e);
    return err(res, 500, 'Sunucu hatası.');
  }
}
