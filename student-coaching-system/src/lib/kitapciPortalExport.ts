import * as XLSX from 'xlsx';
import type { KitapciPortalOrder } from './kitapciPortalApi';

function statusLabelTr(status: string) {
  switch (status) {
    case 'notified':
      return 'Yeni sipariş';
    case 'confirmed':
      return 'Onaylandı';
    case 'shipped':
      return 'Kargoya verildi';
    default:
      return status;
  }
}

function formatTrDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function safeFilePart(s: string) {
  return String(s || 'kitapci')
    .trim()
    .replace(/[^\w\u00C0-\u024F\s-]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'kitapci';
}

export function exportKitapciOrdersToExcel(orders: KitapciPortalOrder[], booksellerName: string) {
  const rows = orders.map((o) => ({
    'Sipariş tarihi': formatTrDate(o.created_at),
    Durum: statusLabelTr(o.status),
    'Öğrenci ad soyad': o.ogrenci_ad_soyad || '',
    'Veli ad soyad': o.veli_ad_soyad || '',
    Sınıf: o.sinif || '',
    Telefon: o.telefon || '',
    Adres: o.adres || '',
    İlçe: o.ilce || '',
    İl: o.il || '',
    'Kitap seti': o.kitaplar || '',
    'Ücret durumu': o.ucret_durumu || '',
    'Sipariş notu': o.siparis_notu || '',
    'Kargo takip no': o.kargo_takip_no || '',
    'Kitapçı notu': o.kitapci_notu || '',
    'Onay tarihi': formatTrDate(o.kitapci_confirmed_at),
    'Kargo tarihi': formatTrDate(o.shipped_at)
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 14 },
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
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Siparişler');

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `kitap-siparisleri-${safeFilePart(booksellerName)}-${stamp}.xlsx`;
  XLSX.writeFile(wb, filename);
}
