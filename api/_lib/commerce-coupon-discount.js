/**
 * Kupon indirimi (kuruş). Sepet, checkout_prepare ve ödeme sayfası aynı formülü kullanır.
 */
export function computeCouponDiscount(coupon, subtotalKurus) {
  const subtotal = Number(subtotalKurus);
  if (!coupon || !Number.isFinite(subtotal) || subtotal < 0) return 0;
  const minOrder = Number(coupon.min_order_kurus || 0);
  if (subtotal < minOrder) return 0;
  let disc =
    String(coupon.discount_type) === 'percent'
      ? Math.round((subtotal * Number(coupon.discount_value || 0)) / 100)
      : Number(coupon.discount_value || 0);
  if (!Number.isFinite(disc) || disc < 0) disc = 0;
  const cap = coupon.max_discount_kurus != null ? Number(coupon.max_discount_kurus) : null;
  if (cap != null && Number.isFinite(cap) && cap > 0) disc = Math.min(disc, cap);
  return Math.max(0, Math.min(Math.round(disc), subtotal));
}
