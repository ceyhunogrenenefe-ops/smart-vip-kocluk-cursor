/**
 * Junior VIP — ders / konu adlarını mevcut konu havuzu kataloğuyla eşleştirir.
 * Katalog `scripts/build-junior-vip-catalog.mjs` ile ön yüz konu havuzundan üretilir.
 */
import { createRequire } from 'node:module';
import { fuzzyPhraseIn, levenshtein, trKey, fuzzyTolerance } from './junior-vip-text.js';

const require = createRequire(import.meta.url);
const CATALOG = require('./junior-vip-topic-catalog.json');

/**
 * Kısaltma / günlük kullanım → katalogdaki ders kökü. Kök, öğrencinin sınıf seviyesindeki
 * derslerle (ör. "MATEMATİK", "TYT MATEMATİK", "AYT MATEMATİK") birleştirilir.
 */
const SUBJECT_ALIASES = [
  { keys: ['matematik', 'mat', 'matematigi', 'matematikten', 'mate', 'math'], root: 'MATEMATİK' },
  { keys: ['geometri', 'geo'], root: 'GEOMETRİ' },
  { keys: ['turkce', 'turkceden', 'trk'], root: 'TÜRKÇE' },
  { keys: ['fen', 'fen bilimleri', 'fenden'], root: 'FEN BİLİMLERİ' },
  { keys: ['sosyal', 'sosyal bilgiler', 'sosyalden'], root: 'SOSYAL BİLGİLER' },
  { keys: ['inkilap', 'inkilap tarihi', 'ink'], root: 'İNKILAP TARİHİ' },
  { keys: ['din', 'din kulturu', 'dkab'], root: 'DİN KÜLTÜRÜ' },
  { keys: ['ingilizce', 'english', 'ing'], root: 'İNGİLİZCE' },
  { keys: ['almanca'], root: 'ALMANCA' },
  { keys: ['fizik'], root: 'FİZİK' },
  { keys: ['kimya'], root: 'KİMYA' },
  { keys: ['biyoloji', 'bio', 'biyo'], root: 'BİYOLOJİ' },
  { keys: ['tarih'], root: 'TARİH' },
  { keys: ['cografya'], root: 'COĞRAFYA' },
  { keys: ['edebiyat', 'edb'], root: 'EDEBİYAT' },
  { keys: ['felsefe'], root: 'FELSEFE' },
  { keys: ['hayat bilgisi'], root: 'HAYAT BİLGİSİ' },
  { keys: ['paragraf'], root: 'Paragraf Çözme' },
  { keys: ['problem'], root: 'Problem Çözme' },
  { keys: ['kitap', 'kitap okuma', 'okuma'], root: 'Kitap Okuma' },
  { keys: ['deneme analizi'], root: 'Deneme Analizi' },
  { keys: ['deneme', 'deneme sinavi'], root: 'Deneme Sınavı' }
];

const ALL_SUBJECTS = [...Object.keys(CATALOG.subjects), ...CATALOG.study_track_subjects];

function stripPrefix(subject) {
  return String(subject)
    .replace(/^(TYT MAARİF|TYT|AYT|YÖS)\s+/u, '')
    .replace(/\s*\(SÖZEL\)$/u, '')
    .trim();
}

/** Öğrencinin seviyesine göre havuz anahtarı (ör. "8" → "LGS"). */
export function catalogLevelKey(classLevel) {
  const raw = String(classLevel ?? '').trim();
  if (!raw) return '';
  if (raw === '8') return 'LGS';
  return raw;
}

/** Öğrencinin seviyesinde geçerli dersler (+ her seviyedeki çalışma alanları). */
export function subjectsForLevel(classLevel) {
  const key = catalogLevelKey(classLevel);
  if (!key) return ALL_SUBJECTS;
  const list = Object.entries(CATALOG.subjects)
    .filter(([, levels]) => Array.isArray(levels[key]) && levels[key].length)
    .map(([s]) => s);
  if (!list.length) return ALL_SUBJECTS;
  return [...list, ...CATALOG.study_track_subjects];
}

export function topicsFor(subject, classLevel) {
  const levels = CATALOG.subjects[subject];
  if (!levels) return [];
  const key = catalogLevelKey(classLevel);
  if (key && Array.isArray(levels[key])) return levels[key];
  return [...new Set(Object.values(levels).flat())];
}

/**
 * Metinde geçen dersi bulur.
 * @returns {{ status: 'ok', subject: string } | { status: 'ambiguous', options: string[] } | { status: 'none' }}
 */
export function matchSubject(text, classLevel) {
  const t = trKey(text);
  if (!t) return { status: 'none' };
  const allowed = subjectsForLevel(classLevel);

  // 1) Tam ders adı ("TYT MATEMATİK", "FEN BİLİMLERİ") — en uzun eşleşme
  let best = null;
  for (const s of allowed) {
    const k = trKey(s);
    if (k && (` ${t} `.includes(` ${k} `) || fuzzyPhraseIn(t, k)) && (!best || k.length > trKey(best).length)) {
      best = s;
    }
  }
  const prefixed = /\b(tyt|ayt|yos|maarif)\b/.test(t);
  if (best && (prefixed || !/^(TYT|AYT|YÖS)/u.test(best))) return { status: 'ok', subject: best };

  // 2) Kısaltma / kök → seviyedeki aday dersler
  let root = null;
  let rootLen = 0;
  for (const a of SUBJECT_ALIASES) {
    for (const key of a.keys) {
      const hit =
        ` ${t} `.includes(` ${key} `) ||
        (key.length >= 5 && fuzzyPhraseIn(t, key)) ||
        (key.length <= 4 && t.split(' ').some((w) => w === key));
      if (hit && key.length > rootLen) {
        root = a.root;
        rootLen = key.length;
      }
    }
  }
  if (!root && best) root = stripPrefix(best);
  if (!root) return { status: 'none' };

  const rootKey = trKey(root);
  const candidates = allowed.filter((s) => trKey(stripPrefix(s)) === rootKey);
  if (candidates.length === 1) return { status: 'ok', subject: candidates[0] };
  if (candidates.length > 1) {
    const exact = candidates.find((c) => trKey(c) === rootKey);
    if (exact && !candidates.some((c) => c !== exact && /^(TYT|AYT)/u.test(c))) return { status: 'ok', subject: exact };
    return { status: 'ambiguous', options: candidates.slice(0, 4) };
  }
  // Seviyede yok ama katalogda var (ör. seviye bilinmiyor) → kökü kullan
  const anyLevel = ALL_SUBJECTS.find((s) => trKey(s) === rootKey);
  if (anyLevel) return { status: 'ok', subject: anyLevel };
  return { status: 'none' };
}

/**
 * Metindeki konuyu katalogla eşleştirir; bulunamazsa öğrencinin söylediği ifade temizlenip kullanılır.
 * @returns {{ topic: string, matched: boolean } | null}
 */
export function matchTopic(text, subject, classLevel) {
  const t = trKey(text);
  if (!t) return null;
  const topics = topicsFor(subject, classLevel);
  let best = null;
  let bestScore = 0;
  for (const topic of topics) {
    const k = trKey(topic);
    if (!k) continue;
    if (` ${t} `.includes(` ${k} `) || fuzzyPhraseIn(t, k)) {
      const score = k.length + 100;
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
      continue;
    }
    // Kısmi: konunun ilk anlamlı kelimeleri ("çarpanlar" → "Çarpanlar ve Katlar")
    const words = k.split(' ').filter((w) => w.length >= 4 && w !== 've');
    if (!words.length) continue;
    const hits = words.filter((w) => t.split(' ').some((tw) => tw === w || (tw.length >= 4 && (tw.startsWith(w) || w.startsWith(tw))) || levenshtein(tw, w) <= fuzzyTolerance(w)));
    const ratio = hits.length / words.length;
    if (hits.length && ratio >= 0.5) {
      const score = ratio * 50 + hits.join('').length;
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
    }
  }
  if (best) return { topic: best, matched: true };
  return null;
}

/** Konu ifadesini katalog dışı serbest metin olarak temizler ("çarpanlar ve katlardan" → "Çarpanlar ve katlar"). */
export function cleanFreeTopic(raw) {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^(konu(su|su:)?|konusu|konudan|konusundan)\s+/i, '')
    .replace(/\s+(konusu(ndan)?|konudan|den|dan|ten|tan)$/i, '')
    .trim();
  if (!s) return '';
  s = s.slice(0, 80);
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

export const JUNIOR_VIP_CATALOG_SUBJECTS = ALL_SUBJECTS;
