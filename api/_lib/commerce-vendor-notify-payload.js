/**
 * Yankı Kitapevi WhatsApp gövdesi — satıcıya giden sabit şablon alanları.
 * Tutar ve IBAN satıcı mesajına yazılmaz.
 */
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { formatShippingOneLine, itemsForVendor } from './commerce-shipping-address.js';
import { formatSellerItemLabel } from './commerce-package-contents.js';

export function vendorNotifyPhone(vendor) {
  if (!vendor || typeof vendor !== 'object') return null;
  const meta = vendor.meta && typeof vendor.meta === 'object' ? vendor.meta : {};
  const fromVendor =
    normalizePhoneToE164(vendor.contact_phone) ||
    normalizePhoneToE164(meta.whatsapp_phone) ||
    normalizePhoneToE164(meta.yanki_whatsapp);
  if (fromVendor) return fromVendor;
  const slug = String(vendor.slug || '').trim();
  if (slug === 'yanki-kitapevi' || meta.use_yanki_whatsapp_env) {
    return normalizePhoneToE164(process.env.COMMERCE_YANKI_WHATSAPP) || null;
  }
  return null;
}

/** Checkout notundaki IBAN / tutar / ödeme satırlarını satıcı mesajından çıkarır. */
export function sellerFacingNote(raw) {
  let s = String(raw || '');
  s = s.replace(/\bTR\d{2}[\d\s]{16,}\b/gi, ' ');
  s = s.replace(/IBAN\s*havale[^·\n]*/gi, ' ');
  s = s.replace(/Ödemeyi buraya yapabilirsiniz[^·\n]*/gi, ' ');
  s = s.replace(/dekont\s+yüklendi/gi, ' ');
  s = s.replace(/Ödeme:\s*[^·\n]+/gi, ' ');
  s = s.replace(/Tutar\s+[^·\n]+/gi, ' ');
  s = s.replace(/\d+[.,]?\d*\s*(₺|tl|try)\b/gi, ' ');
  s = s.replace(/Songül Öğrenenefe/gi, ' ');
  return s
    .split(/[·|]/)
    .map((part) => part.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join(' · ');
}

export function buildVendorOrderNotifyPayload({
  order,
  items = [],
  address = null,
  student = null,
  vendor = null,
} = {}) {
  const scoped = itemsForVendor(items, vendor?.id);
  const lines = (scoped || []).map((it) => formatSellerItemLabel(it)).filter(Boolean);
  const kitap_seti = lines.length ? lines.join(' | ') : 'Kitap siparişi';
  const addr = address || {};
  const studentName = student?.name || order?.student_name || '';
  const street = formatShippingOneLine(addr) || [addr.address_line1, addr.address_line2].filter(Boolean).join(' ').trim();
  const note = sellerFacingNote(order?.notes);
  const siparis_notu = note || (order?.order_number ? `Sipariş ${order.order_number}` : '-');

  return {
    veli_ad_soyad: order?.customer_name || addr.full_name || '-',
    ogrenci_ad_soyad: studentName || order?.customer_name || '-',
    sinif: student?.class_level || student?.classLevel || '8. Sınıf / LGS',
    kitap_seti,
    ucret_durumu: '-',
    telefon: order?.customer_phone || addr.phone || '-',
    adres: street || '-',
    ilce: addr.district || '-',
    il: addr.city || '-',
    siparis_notu,
  };
}
