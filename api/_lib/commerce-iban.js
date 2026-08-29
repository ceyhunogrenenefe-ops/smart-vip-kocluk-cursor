/**
 * Kitap mağazası — IBAN / havale tahsilat.
 * Kart ödemesi onlinevipdershane.com'da; havale sepet içinde kalır.
 */

export const COMMERCE_IBAN_ACCOUNT = {
  holder: 'Songül Öğrenenefe',
  iban: 'TR870003200000000066792070',
  note: 'Ödemeyi buraya yapabilirsiniz',
};

export const IBAN_RECEIPT_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
export const IBAN_RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

export function normalizeIban(value) {
  return String(value || '').replace(/[\s-]+/g, '').toUpperCase();
}

export function formatIbanDisplay(iban) {
  const n = normalizeIban(iban);
  return n.replace(/(.{4})/g, '$1 ').trim();
}

export function resolveIbanAccount(settings) {
  const meta = settings?.iban_payment || settings?.meta?.iban_payment || {};
  const holder = String(meta.holder || COMMERCE_IBAN_ACCOUNT.holder).trim() || COMMERCE_IBAN_ACCOUNT.holder;
  const iban = normalizeIban(meta.iban || COMMERCE_IBAN_ACCOUNT.iban) || COMMERCE_IBAN_ACCOUNT.iban;
  const note = String(meta.note || COMMERCE_IBAN_ACCOUNT.note).trim() || COMMERCE_IBAN_ACCOUNT.note;
  return {
    enabled: meta.enabled !== false,
    holder,
    iban,
    note,
  };
}

export function stripDataUrl(base64str) {
  const s = String(base64str || '');
  const comma = s.indexOf(',');
  return comma >= 0 ? s.slice(comma + 1) : s;
}

export function parseIbanReceipt({ file_base64, mime_type } = {}) {
  const mime = String(mime_type || '').trim().toLowerCase();
  if (!file_base64) throw new Error('Dekont yükleyin (fotoğraf veya PDF)');
  if (!IBAN_RECEIPT_MIMES.includes(mime)) {
    throw new Error('Dekont jpeg, png, webp veya PDF olmalı');
  }
  const raw = stripDataUrl(file_base64);
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.byteLength) throw new Error('Dekont dosyası okunamadı');
  if (buffer.byteLength > IBAN_RECEIPT_MAX_BYTES) {
    throw new Error('Dekont 8 MB sınırını aşıyor');
  }
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, mime: mime === 'image/jpg' ? 'image/jpeg' : mime, ext };
}
