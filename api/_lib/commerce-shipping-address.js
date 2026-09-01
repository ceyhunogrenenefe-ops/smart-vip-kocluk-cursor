/**
 * Kitap kargo teslimat adresi — sepet / ödeme gövdesinden okur.
 * Satıcı WhatsApp ve kitapçı paneli bu kaydı kullanır.
 */

export function parseShippingFromBody(body = {}) {
  const addr = body.address && typeof body.address === 'object' ? body.address : {};
  const c = body.customer && typeof body.customer === 'object' ? body.customer : {};
  return {
    full_name: String(
      body.customer_name || body.full_name || addr.full_name || c.parentName || c.name || ''
    ).trim(),
    phone: String(body.customer_phone || body.phone || addr.phone || c.phone || '').trim(),
    email: String(body.customer_email || body.email || c.email || '').trim().toLowerCase(),
    address_line1: String(addr.address_line1 || addr.line1 || body.address_line1 || '').trim(),
    address_line2: String(addr.address_line2 || addr.line2 || body.address_line2 || '').trim(),
    district: String(addr.district || body.district || '').trim(),
    city: String(addr.city || body.city || '').trim(),
    postal_code: String(addr.postal_code || addr.postalCode || body.postal_code || '').trim(),
    notes: String(body.notes || body.studentInfo || c.studentInfo || addr.notes || '').trim()
  };
}

export function assertShippingComplete(ship, { requireEmail = true } = {}) {
  const s = ship && typeof ship === 'object' ? ship : {};
  if (!s.full_name || String(s.full_name).length < 3) {
    throw new Error('Veli adı soyadı en az 3 karakter olmalıdır.');
  }
  if (String(s.phone || '').replace(/\D/g, '').length < 10) {
    throw new Error('Geçerli telefon girin');
  }
  if (requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || ''))) {
    throw new Error('Geçerli e-posta girin');
  }
  if (!s.address_line1) throw new Error('Teslimat adresi gerekli');
  if (!s.city) throw new Error('İl gerekli');
  return s;
}

export function shippingIsComplete(ship) {
  try {
    assertShippingComplete(ship, { requireEmail: false });
    return true;
  } catch {
    return false;
  }
}

export function shippingInsertRow(orderId, ship) {
  return {
    order_id: orderId,
    address_type: 'shipping',
    full_name: ship.full_name,
    phone: ship.phone || null,
    address_line1: ship.address_line1,
    address_line2: ship.address_line2 || null,
    district: ship.district || null,
    city: ship.city,
    postal_code: ship.postal_code || null,
    country: 'TR'
  };
}

export function formatShippingOneLine(addr) {
  if (!addr || typeof addr !== 'object') return '';
  return [addr.address_line1, addr.address_line2, addr.district, addr.city, addr.postal_code]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Çok satıcılı sepette her kitapçı yalnız kendi kalemlerini görsün. */
export function itemsForVendor(items, vendorId) {
  const list = Array.isArray(items) ? items : [];
  const vid = String(vendorId || '').trim();
  if (!vid) return list;
  const mine = list.filter((it) => String(it.vendor_id || '') === vid);
  return mine.length ? mine : list;
}
