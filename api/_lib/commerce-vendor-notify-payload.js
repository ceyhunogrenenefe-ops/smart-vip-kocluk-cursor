/**
 * Yankı Kitapevi WhatsApp gövdesi — DB/WhatsApp bağımlılığı yok (birim test).
 */
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { formatCommerceTry } from './commerce-utils.js';

export function vendorNotifyPhone(vendor) {
  if (!vendor || typeof vendor !== 'object') return null;
  const meta = vendor.meta && typeof vendor.meta === 'object' ? vendor.meta : {};
  return (
    normalizePhoneToE164(vendor.contact_phone) ||
    normalizePhoneToE164(meta.whatsapp_phone) ||
    normalizePhoneToE164(meta.yanki_whatsapp) ||
    normalizePhoneToE164(process.env.COMMERCE_YANKI_WHATSAPP) ||
    null
  );
}

export function buildVendorOrderNotifyPayload({
  order,
  items = [],
  address = null,
  student = null,
  vendor = null,
} = {}) {
  const lines = (items || [])
    .map((it) => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const title = String(it.title_snapshot || it.title || 'Kitap').trim();
      return qty > 1 ? `${title} × ${qty}` : title;
    })
    .filter(Boolean);
  const kitap_seti = lines.length ? lines.join(' | ') : 'Kitap siparişi';
  const addr = address || {};
  const studentName = student?.name || order?.student_name || '';
  const notes = [
    order?.order_number ? `Sipariş ${order.order_number}` : '',
    order?.total_kurus != null ? `Tutar ${formatCommerceTry(order.total_kurus)}` : '',
    'Ödeme: Kredi kartı (ödendi)',
    vendor?.name ? `Satıcı: ${vendor.name}` : '',
    order?.notes || '',
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' · ');

  return {
    veli_ad_soyad: order?.customer_name || addr.full_name || '-',
    ogrenci_ad_soyad: studentName || order?.customer_name || '-',
    sinif: student?.class_level || student?.classLevel || '8. Sınıf / LGS',
    kitap_seti,
    ucret_durumu: 'Ödendi',
    telefon: order?.customer_phone || addr.phone || '-',
    adres: [addr.address_line1, addr.address_line2].filter(Boolean).join(' ') || order?.notes || '-',
    ilce: addr.district || '-',
    il: addr.city || '-',
    siparis_notu: notes || 'Kargo takip numarasını satıcı panelinden girin.',
  };
}
