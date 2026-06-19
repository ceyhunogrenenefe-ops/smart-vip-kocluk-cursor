import * as XLSX from 'xlsx';
import type { BookOrderRow } from './bookOrdersApi';

function formatTrDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function orderStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Onay bekliyor';
    case 'approved':
      return 'Onaylandı';
    case 'notified':
      return 'Kitapçıya iletildi';
    case 'confirmed':
      return 'Kitapçı onayladı';
    case 'shipped':
      return 'Kargoda';
    case 'cancelled':
      return 'İptal';
    default:
      return status;
  }
}

function waStatusLabel(status: string) {
  switch (status) {
    case 'awaiting_approval':
      return 'Onay bekliyor';
    case 'pending':
      return 'Gönderim bekliyor';
    case 'sending':
      return 'Gönderiliyor';
    case 'accepted':
      return 'Meta kabul';
    case 'delivered':
      return 'Teslim edildi';
    case 'sent':
      return 'Gateway gönderildi';
    case 'failed':
      return 'Başarısız';
    case 'skipped':
      return 'Atlandı';
    default:
      return status;
  }
}

function safeFilePart(s: string) {
  return String(s || 'siparisler')
    .trim()
    .replace(/[^\w\u00C0-\u024F\s-]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'siparisler';
}

export function exportBookOrdersToExcel(orders: BookOrderRow[], fileLabel = 'kitap-siparisleri') {
  const rows = orders.map((o) => ({
    'Sipariş tarihi': formatTrDate(o.created_at),
    Durum: orderStatusLabel(o.status),
    'WhatsApp durumu': waStatusLabel(o.whatsapp_status),
    'Öğrenci ad soyad': o.ogrenci_ad_soyad || o.ogrenci_adi || '',
    'Veli ad soyad': o.veli_ad_soyad || o.veli_adi || '',
    Sınıf: o.sinif || '',
    Telefon: o.telefon || '',
    Adres: o.adres || '',
    İlçe: o.ilce || '',
    İl: o.il || '',
    'Kitap seti': o.kitaplar || '',
    'Ücret durumu': o.ucret_durumu || '',
    'Sipariş notu': o.siparis_notu || o.notlar || '',
    Kitapçı: o.kitapci_adi || '',
    'Kitapçı telefon': o.kitapci_phone || '',
    'Kargo takip no': o.kargo_takip_no || '',
    'Kitapçı notu': o.kitapci_notu || '',
    'Kitapçı onay': formatTrDate(o.kitapci_confirmed_at),
    'Kargo tarihi': formatTrDate(o.shipped_at),
    'WA gönderim': formatTrDate(o.whatsapp_sent_at)
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 8 },
    { wch: 14 },
    { wch: 36 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 12 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Siparişler');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${safeFilePart(fileLabel)}-${stamp}.xlsx`);
}
