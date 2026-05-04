import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

/** 64 hex chars = 32 bytes */
const loadKeyBuffer = () => {
  const raw = process.env.MEETING_TOKEN_ENCRYPTION_KEY;
  if (!raw || typeof raw !== 'string' || raw.length < 32) return null;
  const hex = raw.replace(/\s+/g, '');
  try {
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length >= 64) {
      return Buffer.from(hex.slice(0, 64), 'hex');
    }
    return crypto.scryptSync(hex, 'scs-meeting-salt-v1', 32);
  } catch {
    return null;
  }
};

export function isTokenEncryptionConfigured() {
  return Boolean(loadKeyBuffer());
}

export function encryptForStorage(plaintext) {
  if (plaintext == null || plaintext === '') return '';
  const key = loadKeyBuffer();
  if (!key) {
    console.warn('[token-crypto] MEETING_TOKEN_ENCRYPTION_KEY not set; storing tokens PLAINTEXT (unsafe).');
    return String(plaintext);
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptFromStorage(blob) {
  if (blob == null || blob === '') return '';
  const key = loadKeyBuffer();
  if (!key) {
    return String(blob);
  }
  try {
    const buf = Buffer.from(String(blob), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('decrypt_failed');
  }
}
