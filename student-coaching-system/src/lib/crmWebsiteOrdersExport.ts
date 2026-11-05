import * as XLSX from 'xlsx';
import type { CrmWebsiteOrderRow } from './crmWebsiteOrdersApi';

const CATEGORY_LABEL: Record<string, string> = {
  deneme: 'Deneme / Kulüp',
  kitap: 'Kitap',
  egitim: 'Eğitim',
  kocluk: 'Koçluk',
  ozel_ders: 'Özel ders',
  diger: 'Diğer',
};

function fmtTry(kurus: number | null) {
  if (kurus == null) return '';
  return (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return iso;
  }
}

export function exportCrmWebsiteOrdersToExcel(rows: CrmWebsiteOrderRow[], filename?: string) {
  const sheetRows = rows.map((r) => ({
    'Sipariş No': r.order_number || '',
    'Müşteri': r.customer_name || '',
    Telefon: r.customer_phone || '',
    Eposta: r.customer_email || '',
    Adres: r.address_display || (r.address_status === 'missing' ? 'Adres Eksik' : ''),
    İl: r.city || '',
    İlçe: r.district || '',
    Ürün: r.product_summary,
    Kategori: CATEGORY_LABEL[r.product_category] || r.product_category,
    Tutar: fmtTry(r.amount_kurus),
    'Ödeme Durumu': r.payment_status,
    'Sipariş Durumu': r.order_status,
    'Ödeme Yöntemi': r.payment_provider || '',
    'Sipariş Tarihi': fmtDate(r.order_placed_at),
    'Ödeme Tarihi': fmtDate(r.paid_at),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Web Siparişleri');
  const name = filename || `crm-web-siparisleri-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
