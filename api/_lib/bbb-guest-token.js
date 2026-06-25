import crypto from 'crypto';

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const parseB64url = (input) => {
  const padded = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
};

function getSecret() {
  const secret = process.env.APP_JWT_SECRET;
  if (secret && secret.trim()) return secret.trim();
  return 'dev-insecure-secret-change-me';
}

/** @param {{ kind: 'class' | 'private', id: string, exp: number }} payload */
export function signBbbGuestJoinToken(payload) {
  const header = { alg: 'HS256', typ: 'BBB_GUEST' };
  const body = {
    purpose: 'bbb_guest_join',
    kind: payload.kind === 'private' ? 'private' : 'class',
    id: String(payload.id || '').trim(),
    exp: Math.floor(Number(payload.exp) || 0)
  };
  if (!body.id || !body.exp) throw new Error('guest_token_invalid_payload');

  const encodedHeader = b64url(JSON.stringify(header));
  const encodedBody = b64url(JSON.stringify(body));
  const unsigned = `${encodedHeader}.${encodedBody}`;
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${unsigned}.${signature}`;
}

export function verifyBbbGuestJoinToken(token) {
  const normalized = normalizeGuestJoinToken(token);
  const [h, p, s] = normalized.split('.');
  if (!h || !p || !s) throw new Error('Geçersiz davet bağlantısı.');
  const unsigned = `${h}.${p}`;
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  if (s !== expected) throw new Error('Geçersiz davet bağlantısı.');
  const payload = JSON.parse(parseB64url(p));
  if (payload.purpose !== 'bbb_guest_join') throw new Error('Geçersiz davet bağlantısı.');
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Davet bağlantısının süresi dolmuş.');
  }
  const kind = payload.kind === 'private' ? 'private' : 'class';
  const id = String(payload.id || '').trim();
  if (!id) throw new Error('Geçersiz davet bağlantısı.');
  return { kind, id, exp: payload.exp };
}

export function publicAppBaseUrl() {
  const u = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || process.env.APP_PUBLIC_URL;
  if (u && String(u).trim()) return String(u).replace(/\/+$/, '');
  return 'https://www.dersonlinevipkocluk.com';
}

/** JWT'yi tek path parçası olarak taşır (WhatsApp / tarayıcı uyumlu). */
export function encodeGuestJoinSlug(token) {
  return Buffer.from(String(token || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function decodeGuestJoinSlug(slug) {
  const raw = String(slug || '').trim();
  if (!raw) return '';
  if (raw.startsWith('eyJ')) return normalizeGuestJoinToken(raw);
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return normalizeGuestJoinToken(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return '';
  }
}

/** URL / API'den gelen bozuk token'ı düzeltir. */
export function normalizeGuestJoinToken(raw) {
  let t = String(raw || '').trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep */
  }
  const jwtMatch = t.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (jwtMatch) t = jwtMatch[0];
  t = t.replace(/\s+/g, '');
  return t;
}

export function guestJoinPageUrl(token) {
  const base = publicAppBaseUrl();
  const slug = encodeGuestJoinSlug(token);
  return `${base}/misafir-katil/${slug}`;
}
