import { errorMessage } from './error-msg.js';

export function isSchemaColumnError(err, column) {
  const msg = errorMessage(err).toLowerCase();
  const col = String(column || '').toLowerCase();
  if (!col) return false;
  return (
    msg.includes(col) &&
    (msg.includes('schema cache') ||
      msg.includes('does not exist') ||
      msg.includes('column') ||
      String(err?.code || '') === '42703' ||
      String(err?.code || '') === 'PGRST204')
  );
}

export function isMissingTableError(err, table) {
  const msg = errorMessage(err).toLowerCase();
  const t = String(table || '').toLowerCase();
  if (!t) return false;
  return (
    msg.includes(t) &&
    (msg.includes('does not exist') ||
      msg.includes('schema cache') ||
      String(err?.code || '') === '42P01' ||
      String(err?.code || '') === 'PGRST205')
  );
}

export function authHttpStatus(err) {
  const msg = errorMessage(err);
  if (/invalid token|invalid signature|token expired/i.test(msg)) return 401;
  return null;
}
