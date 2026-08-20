/**
 * /api/commerce-checkout-pay — Kitap sepeti handoff → Garanti ödeme linki
 *
 * POST (auth) — handoff token + veli bilgileri ile garanti_payment_orders oluşturur
 */

import crypto from 'crypto';
import { requireAuth } from '../api/_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../api/_lib/cors-mobile.js';
import {
  getGarantiConfig,
  kurusToTry,
  publicAppBaseUrl,
} from '../api/_lib/garanti-pos.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

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

function schemaMissing(errMsg) {
  return /garanti_payment_orders|commerce_checkout_handoffs|does not exist|schema cache|PGRST205/i.test(
    String(errMsg || '')
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

function buildOrderTitle(payload) {
  const items = payload?.items || [];
  if (!items.length) return 'Kitap Mağazası Siparişi';
  const first = items[0]?.title || 'Kitap';
  if (items.length === 1) return `Kitap Mağazası — ${first}`;
  return `Kitap Mağazası — ${first} +${items.length - 1} ürün`;
}

function buildOrderNotes(payload, body) {
  const lines = (payload?.items || []).map((it) => `${it.title || 'Kitap'} × ${it.qty || 1}`).join('; ');
  return [
    lines ? `Kitaplar: ${lines}` : '',
    body.studentInfo ? `Öğrenci: ${String(body.studentInfo).slice(0, 200)}` : '',
    payload?.ref ? `Ref: ${payload.ref}` : '',
    payload?.coupon_code ? `Kupon: ${payload.coupon_code}` : '',
    `Handoff: ${payload?.ref || ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500);
}

async function createPay(req, res) {
  let actor;
  try {
    actor = requireAuth(req);
  } catch {
    return err(res, 401, 'Giriş gerekli.');
  }
  if (!actor?.sub || actor.sub === 'anonymous') {
    return err(res, 401, 'Giriş gerekli.');
  }

  const cfg = getGarantiConfig();
  if (!cfg.configured) {
    return err(res, 503, 'garanti_not_configured', { missing: cfg.missing });
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
      return err(res, 503, 'Ödeme tabloları kurulmadı. SQL migration çalıştırın.');
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

  const customerName = String(body.parentName || body.customer_name || '').trim().slice(0, 120);
  const customerEmail = String(body.email || body.customer_email || '').trim().slice(0, 120);
  const customerPhone = String(body.phone || body.customer_phone || '').trim().slice(0, 40);
  const studentInfo = String(body.studentInfo || body.student_info || '').trim().slice(0, 300);

  if (!customerName || !customerEmail || !customerPhone) {
    return err(res, 400, 'Veli adı, telefon ve e-posta zorunludur.');
  }

  const publicToken = randomToken(24);
  const orderId = orderIdFromToken();
  const title = buildOrderTitle(payload);
  const detailNote = buildOrderNotes(payload, { studentInfo });
  const fullTitle = detailNote ? `${title}`.slice(0, 200) : title;

  const row = {
    order_id: orderId,
    public_token: publicToken,
    institution_id: actor.institution_id || null,
    student_payment_record_id: null,
    title: fullTitle,
    amount_kurus: amountKurus,
    currency: 'TRY',
    installment_max: 0,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
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
      return err(res, 503, 'garanti_payment_orders tablosu kurulmadı.');
    }
    console.error('[commerce-checkout-pay:insert]', insertErr.message);
    return err(res, 500, 'Ödeme kaydı oluşturulamadı.');
  }

  await supabaseAdmin
    .from('commerce_checkout_handoffs')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', handoffToken);

  const base = publicAppBaseUrl(req);
  const payUrl = `${base}/odeme/${publicToken}`;

  return res.status(201).json({
    ok: true,
    pay_url: payUrl,
    order_id: order.order_id,
    amount_try: kurusToTry(amountKurus),
    data: order,
  });
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);

  try {
    if (req.method === 'POST') return createPay(req, res);
    res.setHeader('Allow', 'POST, OPTIONS');
    return err(res, 405, 'Method not allowed');
  } catch (e) {
    console.error('[commerce-checkout-pay]', e?.message || e);
    return err(res, 500, 'Sunucu hatası.');
  }
}
