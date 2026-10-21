import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 60 * 60 * 12;

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const parseB64url = (input) => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
};

let warnedInsecureSecret = false;
const getSecret = () => {
  const secret = process.env.APP_JWT_SECRET;
  if (secret && secret.trim()) return secret.trim();
  // Dev/preview fallback: production'da mutlaka APP_JWT_SECRET set edilmelidir.
  if (!warnedInsecureSecret) {
    warnedInsecureSecret = true;
    console.error('[auth] APP_JWT_SECRET tanımlı değil — güvensiz varsayılan anahtar kullanılıyor', {
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown'
    });
  }
  return 'dev-insecure-secret-change-me';
};

/** Yalnız yerel geliştirmede açıkça istenirse token'sız istek kabul edilir. */
const allowAnonymousDev = () =>
  process.env.ALLOW_ANONYMOUS_API === '1' && !process.env.VERCEL && process.env.NODE_ENV !== 'production';

export const signAuthToken = (payload) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };
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
};

export const verifyAuthToken = (token) => {
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p || !s) throw new Error('Invalid token');
  const unsigned = `${h}.${p}`;
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  if (s !== expected) throw new Error('Invalid signature');
  const payload = JSON.parse(parseB64url(p));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
};

export const requireAuth = (req) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    // Güvenlik: token'sız istek artık yetkisiz (eskiden süper admin sayılıyordu).
    if (!allowAnonymousDev()) throw new Error('Missing token');
    return {
      sub: 'anonymous',
      role: 'super_admin',
      institution_id: null,
      coach_id: null,
      student_id: null
    };
  }
  return verifyAuthToken(token);
};

/** Production-sensitive routes (Google, meetings, Twilio) must use this — no anonymous super_admin. */
export const requireAuthenticatedActor = (req) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('Missing token');
  return verifyAuthToken(token);
};

export const hasInstitutionAccess = (actor, institutionId) => {
  if (actor.role === 'super_admin') return true;
  return Boolean(actor.institution_id && actor.institution_id === institutionId);
};

