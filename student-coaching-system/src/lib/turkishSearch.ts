/**
 * Türkçe arama yardımcıları — büyük/küçük harf ve Türkçe karakter farkı gözetmez.
 * "ECRİN TAŞ", "ecrin tas", "Ecrin" aynı kaydı bulur.
 * Sunucu kopyası: api/_lib/turkish-search.js (ikisini birlikte güncelleyin).
 */

const TR_MAP: Record<string, string> = { ı: 'i', İ: 'i', I: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a', î: 'i', Î: 'i', û: 'u', Û: 'u' };

/** Metni aramaya uygun hale getirir: küçük harf, Türkçe harfler sadeleşir, boşluklar tekleşir. */
export function foldTr(value: unknown): string {
  return String(value ?? '')
    .replace(/[ıİIçÇğĞöÖşŞüÜâÂîÎûÛ]/g, (ch) => TR_MAP[ch] || ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aranan her kelime metinde geçiyorsa true (sıra fark etmez). Boş aramada true. */
export function matchesSearch(haystack: unknown, query: string): boolean {
  const tokens = foldTr(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const hay = foldTr(Array.isArray(haystack) ? haystack.filter(Boolean).join(' ') : haystack);
  return tokens.every((t) => hay.includes(t));
}

/**
 * Sınıf değerlerini tek biçime indirger: "5", "5. Sınıf", "5.sinif" → "5"; "YÖS" → "yos";
 * "LGS (8. Sınıf)" / "8" → "lgs"; "TYT Maarif Model" → "tyt-maarif".
 */
export function classLevelKey(value: unknown): string {
  let s = foldTr(value);
  if (!s) return '';
  s = s.replace(/\(.*?\)/g, ' ').replace(/\b(sinif|sinifi)\b/g, ' ').replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s === '8' || s === 'lgs') return 'lgs';
  if (/^tyt[\s-]*maarif/.test(s)) return 'tyt-maarif';
  const yks = s.match(/^yks[\s-]*(.*)$/);
  if (yks) return `yks-${yks[1].replace(/\s+/g, ' ').trim()}`;
  return s;
}
