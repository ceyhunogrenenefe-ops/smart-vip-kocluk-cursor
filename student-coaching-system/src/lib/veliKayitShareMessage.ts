/** Veli kayıt / e-imza sayfasının tam URL’si (tarayıcıda açık olan kök alan adı). */
export function buildVeliImzaPublicUrl(signingToken: string, origin?: string): string {
  const token = String(signingToken || '').trim();
  if (!token) return '';
  const path = `/veli-imza/${encodeURIComponent(token)}`;
  const base =
    origin?.trim() ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

/** Veliye gönderilecek kayıt / e-imza linki — kurum adı mesajda görünsün. */
export function formatVeliKayitShareMessage(opts: {
  kurumAdi: string;
  url: string;
  kayitFormuMu?: boolean;
  ogrenciAdi?: string;
}): string {
  const kurum = String(opts.kurumAdi || '').trim() || 'Kurum';
  const baslik = opts.kayitFormuMu !== false ? 'Kayıt formu' : 'Veli onay ve e-imza';
  const ogrenci = String(opts.ogrenciAdi || '').trim();
  const lines = [`${kurum}`, ogrenci ? `${baslik} — ${ogrenci}` : baslik, '', opts.url.trim()];
  return lines.filter((l, i) => i < 3 || l.length > 0).join('\n');
}
