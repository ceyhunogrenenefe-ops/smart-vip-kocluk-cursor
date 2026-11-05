/**
 * Kitap mağazası — kurumun öğrenciye HEDİYE gönderdiği sipariş.
 * Yalnız admin / super_admin. Ödeme alınmaz; sipariş «ödendi» sayılır ve
 * normal satış gibi satıcı paneline + WhatsApp'a düşer. Satıcının hakedişi
 * (vendor_orders.subtotal) gerçek fiyattan kalır; kurum öder.
 */

export const GIFT_PROVIDER = 'gift';
export const GIFT_COUPON_CODE = 'HEDIYE';

export function canSendGift(roleSet) {
  if (!roleSet || typeof roleSet.has !== 'function') return false;
  return roleSet.has('admin') || roleSet.has('super_admin');
}

/** Satıcıya görünen not: başta HEDİYE etiketi, sonra yöneticinin notu. */
export function giftOrderNotes({ studentName, note } = {}) {
  const parts = ['HEDİYE (ücretsiz — kurum gönderiyor)'];
  const name = String(studentName || '').trim();
  if (name) parts.push(`Öğrenci: ${name}`);
  const extra = String(note || '').replace(/[·|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (extra) parts.push(extra);
  return parts.join(' · ');
}

export function isGiftOrder(order) {
  if (!order) return false;
  if (String(order.coupon_code || '').toUpperCase() === GIFT_COUPON_CODE) return true;
  return /^HEDİYE\b/i.test(String(order.notes || ''));
}

/** Hediye siparişin kalemi: tek ürün veya paket, 1–20 adet. */
export function giftLineFromBody(body = {}) {
  const packageId = String(body.package_id || '').trim();
  const offerId = String(body.vendor_offer_id || '').trim();
  if (!packageId && !offerId) throw new Error('Hediye için kitap veya paket seçin');
  const quantity = Math.max(1, Math.min(20, Math.round(Number(body.quantity) || 1)));
  return packageId
    ? { vendor_offer_id: null, package_id: packageId, quantity, title_snapshot: 'Paket' }
    : { vendor_offer_id: offerId, package_id: null, quantity, title_snapshot: 'Kitap' };
}
