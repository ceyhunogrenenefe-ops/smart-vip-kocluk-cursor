/**
 * /api/commerce-checkout-handoff — Koçluk sepet → ödeme sitesi aktarım token'ı
 *
 * POST (auth)  — sepet özetini kaydet, kısa ömürlü token döndür
 * GET  (public) — token ile sepet özetini oku (onlinevipdershane.com odeme.html)
 */

import crypto from 'crypto';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../api/_lib/cors-mobile.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const HANDOFF_TTL_MS = 30 * 60 * 1000; // 30 dk

function err(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
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

function sanitizeInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function normalizePayload(body, actor) {
  const items = Array.isArray(body.items) ? body.items : [];
  const normalizedItems = items
    .map((it) => ({
      title: String(it?.title || 'Kitap').slice(0, 240),
      qty: Math.max(1, sanitizeInt(it?.qty, 1)),
      unit_kurus: sanitizeInt(it?.unit_kurus ?? it?.unitKurus, 0),
    }))
    .filter((it) => it.unit_kurus > 0);

  const subtotal_kurus = sanitizeInt(body.subtotal_kurus ?? body.subtotalKurus, 0);
  const shipping_kurus = sanitizeInt(body.shipping_kurus ?? body.shippingKurus, 0);
  const discount_kurus = sanitizeInt(body.discount_kurus ?? body.discountKurus, 0);
  const total_kurus = sanitizeInt(body.total_kurus ?? body.totalKurus, 0);

  if (total_kurus < 100) {
    throw new Error('Geçersiz ödeme tutarı.');
  }
  if (!normalizedItems.length) {
    throw new Error('Sepet boş.');
  }

  return {
    items: normalizedItems,
    subtotal_kurus,
    shipping_kurus,
    discount_kurus,
    total_kurus,
    coupon_code: body.coupon_code || body.couponCode || body.coupon || null,
    cart_id: body.cart_id || body.cartId || null,
    user_id: actor.sub || actor.user_id || null,
    student_id: body.student_id || body.studentId || actor.student_id || null,
    ref: body.ref || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

async function createHandoff(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return err(res, 401, 'Giriş gerekli.');
  }

  let payload;
  try {
    payload = normalizePayload(parseBody(req), actor);
  } catch (e) {
    return err(res, 400, e?.message || 'Geçersiz sepet verisi.');
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from('commerce_checkout_handoffs').insert({
    token,
    user_id: payload.user_id,
    student_id: payload.student_id,
    cart_id: payload.cart_id,
    payload,
    expires_at: expiresAt,
  });

  if (error) {
    if (/commerce_checkout_handoffs|does not exist|schema cache|PGRST205/i.test(error.message || '')) {
      return err(res, 503, 'Ödeme aktarım tablosu henüz kurulmadı. Lütfen SQL migration çalıştırın.');
    }
    console.error('[commerce-checkout-handoff:create]', error.message);
    return err(res, 500, 'Ödeme oturumu oluşturulamadı.');
  }

  return res.status(200).json({
    ok: true,
    token,
    expires_at: expiresAt,
    checkout: payload,
  });
}

async function getHandoff(req, res) {
  const token = String(req.query?.token || '').trim();
  if (!token || token.length < 16) {
    return err(res, 400, 'Geçersiz token.');
  }

  const { data, error } = await supabaseAdmin
    .from('commerce_checkout_handoffs')
    .select('payload, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    if (/commerce_checkout_handoffs|does not exist|schema cache|PGRST205/i.test(error.message || '')) {
      return err(res, 503, 'Ödeme aktarım tablosu henüz kurulmadı.');
    }
    console.error('[commerce-checkout-handoff:get]', error.message);
    return err(res, 500, 'Ödeme oturumu okunamadı.');
  }

  if (!data) {
    return err(res, 404, 'Ödeme oturumu bulunamadı veya süresi doldu.');
  }

  if (data.consumed_at) {
    return err(res, 410, 'Ödeme oturumu zaten kullanıldı.');
  }

  const expiresAt = new Date(data.expires_at);
  if (Number.isNaN(+expiresAt) || expiresAt.getTime() < Date.now()) {
    return err(res, 410, 'Ödeme oturumu süresi doldu.');
  }

  return res.status(200).json({
    ok: true,
    checkout: data.payload,
    expires_at: data.expires_at,
  });
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);

  try {
    if (req.method === 'POST') return createHandoff(req, res);
    if (req.method === 'GET') return getHandoff(req, res);
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return err(res, 405, 'Method not allowed');
  } catch (e) {
    console.error('[commerce-checkout-handoff]', e?.message || e);
    return err(res, 500, 'Sunucu hatası.');
  }
}
