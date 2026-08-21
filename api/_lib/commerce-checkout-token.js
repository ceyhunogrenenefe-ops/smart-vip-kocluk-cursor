/** Kitap checkout handoff token (HMAC) — panel ↔ site */
import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 60 * 60; // 60 dk

function checkoutSecret() {
  const s =
    String(process.env.COMMERCE_CHECKOUT_SECRET || '').trim() ||
    String(process.env.OZEL_DERS_WEBHOOK_SECRET || '').trim() ||
    String(process.env.APP_JWT_SECRET || '').trim();
  if (!s) return 'dev-commerce-checkout-secret';
  return s;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseB64url(input) {
  const padded = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/** merchant_oid / orderid — PayTR/Garanti uyumlu alfanümerik */
export function paymentRefFromOrderId(orderId) {
  const hex = String(orderId || '').replace(/-/g, '').toLowerCase();
  if (hex.length !== 32) throw new Error('Geçersiz sipariş id');
  return `KTP${hex}`;
}

export function orderIdFromPaymentRef(ref) {
  const s = String(ref || '').trim();
  if (!/^KTP[a-f0-9]{32}$/i.test(s)) return null;
  const h = s.slice(3).toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function isCommercePaymentRef(ref) {
  return /^KTP[a-f0-9]{32}$/i.test(String(ref || '').trim());
}

export function signCheckoutToken({ orderId, orderNumber, totalKurus, userId }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    oid: orderId,
    on: orderNumber,
    tot: Number(totalKurus) || 0,
    uid: userId || null,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', checkoutSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyCheckoutToken(token) {
  const raw = String(token || '').trim();
  const [body, sig] = raw.split('.');
  if (!body || !sig) throw new Error('Geçersiz checkout token');
  const expected = b64url(crypto.createHmac('sha256', checkoutSecret()).update(body).digest());
  if (sig !== expected) throw new Error('Checkout token imzası geçersiz');
  const payload = JSON.parse(parseB64url(body));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Checkout token süresi dolmuş');
  }
  if (!payload.oid) throw new Error('Checkout token eksik');
  return payload;
}

export function assertWebhookSecret(req) {
  const secret =
    String(process.env.COMMERCE_CHECKOUT_SECRET || '').trim() ||
    String(process.env.OZEL_DERS_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('Webhook secret yapılandırılmamış');
  const got = String(req.headers['x-webhook-secret'] || req.headers['X-Webhook-Secret'] || '').trim();
  if (!got || got !== secret) throw new Error('Yetkisiz webhook');
}

export { checkoutSecret };
