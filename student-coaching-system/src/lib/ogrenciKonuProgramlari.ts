/**
 * Öğrenciye sınıf seviyesine EK konu programı tanımlama.
 *
 * NEDEN GEREKTİ
 * Konular yalnız `class_level`'dan çözülüyordu. 11. sınıf öğrencisi TYT
 * çalışmak istediğinde iki kötü seçenek vardı: ya sınıfını 'TYT-Maarif'
 * yapmak (sınıf raporları, sınıf listesi, veli ekranı bozulur) ya da
 * TYT konularını hiç görmemek.
 *
 * Çözüm: sınıf seviyesi DEĞİŞMEZ; öğrenciye ek program eklenir ve konular
 * birleştirilir. Böylece öğrenci 11. sınıf olarak kalır ama TYT Maarif
 * konularını da planına alabilir.
 */

/** Aynı dersin konuları tekrar etmesin; kaynak sırası korunur */
export function konuListeleriniBirlestir(...listeler: (string[] | null | undefined)[]): string[] {
  const gorulen = new Set();
  const out: string[] = [];
  for (const liste of listeler) {
    for (const k of Array.isArray(liste) ? liste : []) {
      const anahtar = String(k || '').trim();
      if (!anahtar || gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      out.push(k);
    }
  }
  return out;
}

/**
 * Ders -> konu haritalarını birleştirir.
 * Aynı ders iki programda varsa konular tek listede toplanır.
 */
export function konuHaritalariniBirlestir(
  ...haritalar: (Record<string, string[]> | null | undefined)[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const h of haritalar) {
    if (!h || typeof h !== 'object') continue;
    for (const ders of Object.keys(h)) {
      out[ders] = konuListeleriniBirlestir(out[ders], h[ders]);
    }
  }
  return out;
}

/** Geçerli program değerlerini süzer; bilinmeyen değer yok sayılır */
export function programlariTemizle(
  ham: unknown,
  gecerliler?: readonly (string | number)[] | null
): string[] {
  const liste = Array.isArray(ham) ? ham : [];
  const izin = new Set((Array.isArray(gecerliler) ? gecerliler : []).map((x) => String(x)));
  const gorulen = new Set();
  const out: string[] = [];
  for (const p of liste) {
    const s = String(p || '').trim();
    if (!s || gorulen.has(s)) continue;
    if (izin.size && !izin.has(s)) continue;
    gorulen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Öğrencinin konu çözümlemesinde kullanılacak seviyeler.
 * İlki kendi sınıfı; sonrakiler ek programlar.
 * Ek program sınıfın kendisiyle aynıysa tekrarlanmaz.
 */
export function ogrencininKonuSeviyeleri(
  classLevel: string | number | null | undefined,
  extraLevels?: string[] | null
): string[] {
  const ana = classLevel === 0 || classLevel ? String(classLevel) : '';
  const ekler = programlariTemizle(extraLevels, null).filter((x) => x !== ana);
  return ana ? [ana, ...ekler] : ekler;
}
