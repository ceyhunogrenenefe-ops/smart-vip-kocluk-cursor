/**
 * Junior VIP konuşma durumu — çok adımlı akışta (ör. "80 soru çözdüm" → ders → konu → saat) alınan
 * bilgileri tutar. Sunucu tarafından imzalanır (HMAC); istemci değiştiremez, başka öğrenciye taşınamaz.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 45 * 60 * 1000;

function secret() {
  return `${process.env.APP_JWT_SECRET || 'dev-insecure-secret-change-me'}|junior-vip-state`;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function signJuniorVipState(state, studentId) {
  const body = { ...state, sid: String(studentId), exp: Date.now() + TTL_MS };
  const payload = b64url(JSON.stringify(body));
  const mac = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

/** Geçersiz / süresi dolmuş / başka öğrenciye ait durum → boş durum. */
export function verifyJuniorVipState(token, studentId) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return {};
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return {};
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (String(body.sid) !== String(studentId)) return {};
    if (!body.exp || body.exp < Date.now()) return {};
    delete body.sid;
    delete body.exp;
    return body;
  } catch {
    return {};
  }
}
