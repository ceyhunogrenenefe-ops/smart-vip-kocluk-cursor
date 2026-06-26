/** TR / uluslararası telefon → +… E.164 (Graph/Meta öncesi normalize). */
export function normalizePhoneToE164(phone) {
  const digits = String(phone || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  if (!digits) return null;
  let d = digits;
  // Yanlışlıkla +1 ile birleşmiş TR cep: 1520xxxxxxx (11 hane) → 90520xxxxxxx
  if (d.length === 11 && d.startsWith('1') && /^5\d{9}$/.test(d.slice(1))) {
    d = d.slice(1);
  }
  if (d.length === 12 && /^015\d{9}$/.test(d)) {
    d = `90${d.slice(2)}`;
  }
  if (d.startsWith('90') && d.length >= 12) return `+${d}`;
  // Yalnızca TR cep (05xx…) — Almanya vb. 0 ile başlayan 11 hane yanlışlıkla +90 olmasın
  if (d.startsWith('0') && d.length === 11 && d[1] === '5') return `+90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) return `+90${d}`;
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
}

/** Meta Cloud API `to` alanı: ülke kodu ile rakamlar, + olmadan */
export function normalizePhoneDigitsForMeta(e164OrRaw) {
  const d = String(e164OrRaw || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  return d || null;
}
