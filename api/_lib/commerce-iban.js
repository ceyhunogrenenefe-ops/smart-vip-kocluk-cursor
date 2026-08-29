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

function paymentRaw(payment) {
  const raw = payment?.raw_response;
  return raw && typeof raw === 'object' ? raw : {};
}

/** Sipariş listesi / detay — velinin yüklediği dekontu personel görsün. */
export function receiptFromPayments(payments = []) {
  const list = Array.isArray(payments) ? payments : [];
  for (const p of list) {
    const raw = paymentRaw(p);
    const url = String(raw.receipt_url || '').trim();
    if (url) {
      return {
        receipt_url: url,
        payment_method: String(p.provider || raw.method || 'iban').toLowerCase(),
        holder: raw.holder ? String(raw.holder) : null,
        iban: raw.iban ? normalizeIban(raw.iban) : null,
      };
    }
  }
  const ibanPay = list.find((p) => String(p.provider || '').toLowerCase() === 'iban');
  if (ibanPay) {
    const raw = paymentRaw(ibanPay);
    return {
      receipt_url: null,
      payment_method: 'iban',
      holder: raw.holder ? String(raw.holder) : null,
      iban: raw.iban ? normalizeIban(raw.iban) : null,
    };
  }
  const first = list[0];
  return {
    receipt_url: null,
    payment_method: first?.provider ? String(first.provider).toLowerCase() : null,
    holder: null,
    iban: null,
  };
}

export function decorateOrderWithIbanReceipt(order) {
  if (!order || typeof order !== 'object') return order;
  const extra = receiptFromPayments(order.commerce_payments);
  return { ...order, ...extra };
}
