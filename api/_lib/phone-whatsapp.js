/** TR telefon → +90… E.164 (Graph/Meta öncesi normalize). */
export function normalizePhoneToE164(phone) {
  const digits = String(phone || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('90') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Meta Cloud API `to` alanı: ülke kodu ile rakamlar, + olmadan */
export function normalizePhoneDigitsForMeta(e164OrRaw) {
  const d = String(e164OrRaw || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  return d || null;
}
