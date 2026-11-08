/** Junior VIP — Türkçe metin normalleştirme, sayı okuma ve bulanık eşleştirme yardımcıları. */

/** Küçük harf + Türkçe karakterleri ASCII'ye indirger (eşleştirme anahtarı). */
export function trNorm(s) {
  return String(s || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9:.,/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Yalnız harf/rakam ve tek boşluk (konu karşılaştırması için). */
export function trKey(s) {
  return trNorm(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = new Array(t.length + 1);
  let cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[t.length];
}

/** Kelime uzunluğuna göre izin verilen yazım / dikte hatası. */
export function fuzzyTolerance(word) {
  const n = String(word || '').length;
  if (n <= 3) return 0;
  if (n <= 6) return 1;
  return 2;
}

/** `needle` kelime dizisi `hay` içinde (yazım hatası toleransıyla) geçiyor mu? */
export function fuzzyPhraseIn(hay, needle) {
  const h = trKey(hay).split(' ').filter(Boolean);
  const n = trKey(needle).split(' ').filter(Boolean);
  if (!n.length || n.length > h.length) return false;
  for (let i = 0; i + n.length <= h.length; i++) {
    let ok = true;
    for (let k = 0; k < n.length; k++) {
      const hw = h[i + k];
      const nw = n[k];
      if (hw === nw) continue;
      // Türkçe çekim ekleri: "matematikten", "çarpanları" → kök eşleşmesi
      if (nw.length >= 4 && hw.startsWith(nw)) continue;
      if (levenshtein(hw, nw) <= fuzzyTolerance(nw)) continue;
      if (nw.length >= 5 && hw.length > nw.length && levenshtein(hw.slice(0, nw.length), nw) <= 1) continue;
      ok = false;
      break;
    }
    if (ok) return true;
  }
  return false;
}

const ONES = { sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9 };
const TENS = { on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90 };

/**
 * Sesli yazdırmada gelen yazıyla sayıları rakama çevirir ("seksen soru" → "80 soru", "yüz yirmi" → "120").
 * Girdi trNorm'dan geçmiş olmalı.
 */
export function wordsToDigits(normText) {
  const tokens = String(normText || '').split(' ');
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let val = null;
    let j = i;
    let acc = 0;
    let any = false;
    // [N] yüz
    if (ONES[tokens[j]] != null && tokens[j + 1] === 'yuz') {
      acc += ONES[tokens[j]] * 100;
      j += 2;
      any = true;
    } else if (tokens[j] === 'yuz') {
      acc += 100;
      j += 1;
      any = true;
    }
    if (TENS[tokens[j]] != null) {
      acc += TENS[tokens[j]];
      j += 1;
      any = true;
    }
    if (ONES[tokens[j]] != null && !(tokens[j] === 'bir' && !any && !/^\d/.test(tokens[j + 1] || '') && tokens[j + 1] !== 'soru')) {
      // "bir" tek başına sayı değil ("bir konu"); "bir soru" ise 1
      acc += ONES[tokens[j]];
      j += 1;
      any = true;
    }
    if (any) val = acc;
    if (val != null && j > i) {
      out.push(String(val));
      i = j;
    } else {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out.join(' ');
}
