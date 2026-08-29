/**
 * Kitapçı / satıcı paneli — sipariş düzenleme ve silme.
 */

export const VENDOR_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

export const PARENT_ORDER_EDIT_STATUSES = [
  'pending_payment',
  'paid',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'payment_failed',
];

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function buildVendorOwnedOrderPatch(body) {
  const parent = {};
  if (body.customer_name !== undefined) parent.customer_name = trimOrNull(body.customer_name);
  if (body.customer_email !== undefined) parent.customer_email = trimOrNull(body.customer_email);
  if (body.customer_phone !== undefined) parent.customer_phone = trimOrNull(body.customer_phone);
  if (body.notes !== undefined) parent.notes = trimOrNull(body.notes);
  if (body.order_status !== undefined && body.order_status !== '') {
    const st = String(body.order_status).trim();
    if (!PARENT_ORDER_EDIT_STATUSES.includes(st)) throw new Error('Geçersiz sipariş durumu');
    parent.status = st;
  }

  const vendor = {};
  if (body.vendor_notes !== undefined) vendor.vendor_notes = trimOrNull(body.vendor_notes);
  if (body.status !== undefined && body.status !== '') {
    const st = String(body.status).trim();
    if (!VENDOR_ORDER_STATUSES.includes(st)) throw new Error('Geçersiz kitapçı sipariş durumu');
    vendor.status = st;
  }

  return { parent, vendor };
}

export function vendorStatusTimestamps(status, nowIso) {
  const patch = {};
  if (status === 'confirmed') patch.accepted_at = nowIso;
  if (status === 'preparing') patch.prepared_at = nowIso;
  if (status === 'shipped') patch.shipped_at = nowIso;
  if (status === 'delivered') patch.delivered_at = nowIso;
  return patch;
}

/** commerce_orders ilişkisi nesne veya dizi olabilir; düz parent satırı da kabul eder. */
export function parentOrderFromVendorRow(row) {
  if (!row || typeof row !== 'object') return null;
  const raw = row.commerce_orders;
  if (raw) return Array.isArray(raw) ? raw[0] || null : raw;
  if (row.payment_status != null) return row;
  return null;
}

/** Satıcı kanalı: yalnızca kart / IBAN ile ödemesi alınan siparişler. */
export function isPaidParentOrder(rowOrOrder) {
  const order = parentOrderFromVendorRow(rowOrOrder);
  if (!order) return false;
  const pay = String(order.payment_status || '').trim().toLowerCase();
  const st = String(order.status || '').trim().toLowerCase();
  return pay === 'paid' || st === 'paid';
}

export function filterPaidVendorOrders(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => isPaidParentOrder(row));
}
