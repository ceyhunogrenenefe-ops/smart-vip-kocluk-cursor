/**
 * /api/commerce-store — istemci hatalarını 500'e çevirme.
 */

export function assignedCatalogIfNoStudent(studentId) {
  const id = String(studentId || '').trim();
  if (id) return null;
  return { ok: true, assignments: [] };
}

export function commerceStoreHttpStatus(msg) {
  const m = String(msg || '');
  if (/Yetkisiz|giriş gerekli/i.test(m)) return 401;
  if (
    /Yetki yok|öğrenci bulunamadı|gerekli|Geçersiz|süresi dolmuş|bulunamadı|yeterli stok|Sepet boş|yapılandırılmamış|Veli|e-posta|telefon|karakter|PayTR|Garanti|token|ödeme|Sipariş|kupon|Kupon|indirim|Dekont|IBAN|havale|Bilinmeyen operasyon|artık mevcut|artık satışta|stok yetersiz|şu an kapalı|eksik|mevcut değil/i.test(
      m
    )
  ) {
    return 400;
  }
  return 500;
}
