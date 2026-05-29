/** Mobil uygulama ve öğrenci kabuğunda görünen kurum / marka adı */
export const APP_DISPLAY_NAME = 'Online VIP Ders ve Koçluk';

const LEGACY_NAMES = new Set([
  'smart koçluk sistemi',
  'smart koçluk',
  'smart vip koçluk',
  'öğrenci koçluk sistemi'
]);

/** Veritabanı kurum adını mobil marka adına çevirir (eski Smart Koçluk kayıtları dahil). */
export function displayInstitutionName(dbName: string | null | undefined, preferAppBrand = false): string {
  if (preferAppBrand) return APP_DISPLAY_NAME;
  const trimmed = String(dbName || '').trim();
  if (!trimmed) return APP_DISPLAY_NAME;
  if (LEGACY_NAMES.has(trimmed.toLocaleLowerCase('tr-TR'))) return APP_DISPLAY_NAME;
  return trimmed;
}
