import * as XLSX from 'xlsx';

type VendorOrderExportRow = {
  id: string;
  status: string;
  sinif?: string | null;
  vendor_notes?: string | null;
  created_at?: string;
  commerce_orders?: {
    order_number?: string;
    student_name?: string | null;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    notes?: string | null;
    payment_status?: string;
    created_at?: string;
    commerce_order_addresses?: Array<{
      address_type?: string;
      full_name?: string | null;
      phone?: string | null;
      address_line1?: string | null;
      address_line2?: string | null;
      district?: string | null;
      city?: string | null;
      postal_code?: string | null;
    }>;
  };
  commerce_order_items?: Array<{
    title_snapshot: string;
    isbn_snapshot?: string | null;
    quantity: number;
    package_name?: string | null;
    package_contents?: Array<{ title: string; quantity: number }> | null;
  }>;
};

function statusLabelTr(status: string) {
  switch (String(status || '')) {
    case 'pending':
      return 'Yeni';
    case 'confirmed':
      return 'Onaylandı';
    case 'preparing':
      return 'Hazırlanıyor';
    case 'shipped':
      return 'Kargoda';
    case 'delivered':
      return 'Teslim Edildi';
    case 'cancelled':
      return 'İptal';
    default:
      return status || '';
  }
}

function formatTrDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function safeFilePart(s: string) {
  return String(s || 'satici')
    .trim()
    .replace(/[^\w\u00C0-\u024F\s-]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'satici';
}

function shippingAddr(order: VendorOrderExportRow['commerce_orders']) {
  const raw = order?.commerce_order_addresses;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((a) => a.address_type === 'shipping') || list[0] || null;
}

function formatAddress(addr: NonNullable<ReturnType<typeof shippingAddr>>) {
  return [addr.address_line1, addr.address_line2, addr.district, addr.city, addr.postal_code]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
}

function formatItems(items: VendorOrderExportRow['commerce_order_items']) {
  return (items || [])
    .map((it) => {
      const title = it.package_name || it.title_snapshot || '';
      const contents = (it.package_contents || [])
        .map((c) => `${c.title}${c.quantity > 1 ? ` ×${c.quantity}` : ''}`)
        .join('; ');
      const base = `${title}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`;
      return contents ? `${base} — ${contents}` : base;
    })
    .filter(Boolean)
    .join(' | ');
}

export function exportVendorOrdersToExcel(orders: VendorOrderExportRow[], vendorName = 'satici') {
  const rows = orders.map((vo) => {
    const order = vo.commerce_orders;
    const addr = shippingAddr(order);
    return {
      'Sipariş no': order?.order_number || '',
      'Sipariş tarihi': formatTrDate(order?.created_at || vo.created_at),
      Durum: statusLabelTr(vo.status),
      'Öğrenci / müşteri': order?.student_name || order?.customer_name || addr?.full_name || '',
      Sınıf: vo.sinif || '',
      Telefon: order?.customer_phone || addr?.phone || '',
      Eposta: order?.customer_email || '',
      Adres: addr ? formatAddress(addr) : '',
      'Kitap / set': formatItems(vo.commerce_order_items),
      'Ödeme durumu': order?.payment_status || '',
      'Satıcı notu': vo.vendor_notes || '',
      'Sipariş notu': order?.notes || '',
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 24 },
    { wch: 8 },
    { wch: 14 },
    { wch: 22 },
    { wch: 40 },
    { wch: 40 },
    { wch: 12 },
    { wch: 20 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Siparişlerim');

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `siparislerim-${safeFilePart(vendorName)}-${stamp}.xlsx`;
  XLSX.writeFile(wb, filename);
}
