/**
 * Sipariş sınıfı — satıcıya hangi sınıfın denemesi/kitabı gideceği.
 *
 * Hata (2026-11-05): «5-6-7.SINIF DENEME KULÜBÜ» alan 6. sınıf öğrenci satıcıya
 * «7. Sınıf», «9. ve 10. Sınıf» paketini alan 9. sınıf öğrenci «10. Sınıf»
 * olarak düşüyordu. Sipariş öğrenciye bağlı değilse sınıf ürün adından
 * tahmin ediliyor, çok sınıflı adda regex yanlış sayıyı yakalıyordu.
 *
 * Çözüm: alıcının ödeme ekranında seçtiği sınıf siparişe «Sınıf: X» etiketiyle
 * yazılır ve her zaman önce o okunur. Ürün adı birden fazla sınıf içeriyorsa
 * artık tahmin yapılmaz; satıcı «sınıf belirtilmedi» uyarısını görür.
 */

const NUMERIC_CLASSES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const EXAM_CLASSES = ['LGS', 'TYT', 'AYT', 'YKS', 'YOS', 'Mezun'];

/** Seçilebilir sınıflar (ödeme ekranı ile aynı liste). */
export const ORDER_SINIF_OPTIONS = [...NUMERIC_CLASSES, ...EXAM_CLASSES];

const TAG_RE = /(?:^|[·|\n]\s*)Sınıf:\s*([^·|\n]+)/i;

/** «6», «6. sınıf», «6.Sınıf», «lgs», «Mezun» → kanonik değer; tanınmazsa ''. */
export function normalizeOrderSinif(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  s = s.replace(/\s*\.?\s*s[iıİI]n[iıİI]f[iı]?\s*$/i, '').replace(/\.$/, '').trim();
  if (NUMERIC_CLASSES.includes(s)) return s;
  const up = s.toLocaleUpperCase('tr-TR').replace('Ö', 'O');
  if (up === 'MEZUN') return 'Mezun';
  if (up === 'YÖS' || up === 'YOS') return 'YOS';
  if (EXAM_CLASSES.includes(up)) return up;
  return '';
}

export function formatSinifLabel(level) {
  const raw = String(level || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `${raw}. Sınıf`;
  return raw;
}

/** Siparişe yazılan etiket: «Sınıf: 6. Sınıf». */
export function sinifNoteTag(level) {
  const n = normalizeOrderSinif(level);
  return n ? `Sınıf: ${formatSinifLabel(n)}` : '';
}

/** Nottaki «Sınıf: X» etiketini okur (alıcının seçimi). */
export function extractSinifFromNotes(notes) {
  const m = String(notes || '').match(TAG_RE);
  return m ? normalizeOrderSinif(m[1]) : '';
}

/** Nota sınıf etiketini ekler; eskisi varsa değiştirir. */
export function withSinifTag(notes, level) {
  const tag = sinifNoteTag(level);
  const base = String(notes || '')
    .split('·')
    .map((p) => p.trim())
    .filter((p) => p && !/^Sınıf:/i.test(p))
    .join(' · ');
  if (!tag) return base || null;
  return base ? `${base} · ${tag}` : tag;
}

/** Ürün adındaki tüm sınıf numaraları («5-6-7.SINIF» → 5,6,7; «9. ve 10. Sınıf» → 9,10). */
export function classNumbersInText(text) {
  const hay = String(text || '');
  const found = new Set();
  const groupRe = /((?:\b(?:[2-9]|1[0-2])\s*\.?\s*(?:[-–,/]|ve|ile|&)\s*)*\b(?:[2-9]|1[0-2]))\s*\.?\s*s[iıİI]n[iıİI]f/gi;
  let m;
  while ((m = groupRe.exec(hay))) {
    for (const n of m[1].match(/\d+/g) || []) found.add(String(Number(n)));
  }
  return [...found].sort((a, b) => Number(a) - Number(b));
}

/**
 * Ürün adından sınıf — yalnız tek sınıf geçiyorsa. Çok sınıflı adda tahmin yok.
 * @returns {{ level: string, ambiguous: string[] }}
 */
export function inferSinifFromTitles(titles) {
  const text = (Array.isArray(titles) ? titles : [titles]).filter(Boolean).join(' ');
  const nums = classNumbersInText(text);
  if (nums.length === 1) return { level: nums[0], ambiguous: [] };
  if (nums.length > 1) return { level: '', ambiguous: nums };
  const exam = text.match(/\b(LGS|TYT|AYT|YKS|YÖS|YOS)\b/i);
  return { level: exam ? normalizeOrderSinif(exam[1]) : '', ambiguous: [] };
}

/**
 * Satıcıya gösterilecek sınıf.
 * Öncelik: alıcının seçimi (not etiketi) → öğrenci kartı → paket sınıfı → tek sınıflı ürün adı.
 */
export function resolveOrderSinif({ notes, studentClassLevel, packageClassLevel, titles } = {}) {
  const chosen = extractSinifFromNotes(notes);
  if (chosen) return { label: formatSinifLabel(chosen), level: chosen, source: 'buyer' };
  const student = normalizeOrderSinif(studentClassLevel) || String(studentClassLevel || '').trim();
  if (student) return { label: formatSinifLabel(student), level: student, source: 'student' };
  const pkg = String(packageClassLevel || '').trim();
  if (pkg) return { label: formatSinifLabel(pkg), level: pkg, source: 'package' };
  const inferred = inferSinifFromTitles(titles);
  if (inferred.level) return { label: formatSinifLabel(inferred.level), level: inferred.level, source: 'title' };
  if (inferred.ambiguous.length) {
    return {
      label: `${inferred.ambiguous.join('-')}. Sınıf — sınıf belirtilmedi, veliye sorun`,
      level: '',
      source: 'ambiguous',
    };
  }
  return { label: '', level: '', source: 'none' };
}

/** Kitap sınıf listesinde birden fazla okul sınıfı var mı (ör. 5-6-7 deneme paketi). */
export function isMultiClassBook(classLevels) {
  const nums = new Set((classLevels || []).map((c) => String(c).trim()).filter((c) => /^\d+$/.test(c)));
  return nums.size > 1;
}
