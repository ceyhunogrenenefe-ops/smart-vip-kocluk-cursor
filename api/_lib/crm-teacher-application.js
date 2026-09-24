/**
 * Öğretmen başvurusu tespiti.
 *
 * Gelen mesaj kuruma iş başvurusu gibi görünüyorsa konuşma işaretlenir ve
 * temsilciye "öğretmen şablonunu gönder" düğmesi çıkar. Mesaj KENDİLİĞİNDEN
 * gönderilmez — yanlış tespitte veliye alakasız mesaj gitmesin diye karar
 * temsilcide kalır (sistemin genel ilkesiyle aynı).
 */

/** Türkçe küçük harf + şapkasız, arama için sadeleştirilmiş metin. */
export function normalizeApplicationText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[âÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[ûÛ]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tek başına başvuru sayılan açık kalıplar. */
const STRONG_PATTERNS = [
  'ogretmen basvuru',
  'öğretmen basvuru',
  'ogretmen başvuru',
  'öğretmen başvuru',
  'ogretmen alimi',
  'öğretmen alımı',
  'ogretmen ilani',
  'öğretmen ilanı',
  'is basvurusu',
  'iş başvurusu',
  'ozgecmis',
  'özgeçmiş',
  'cv gonderebilir',
  'cv gönderebilir',
  'cv paylasabilir',
  'cv paylaşabilir',
  'ogretmen olarak calis',
  'öğretmen olarak çalış',
  'ogretmen olarak basvur',
  'öğretmen olarak başvur',
  'kadronuzda',
  'ogretmen ihtiyaciniz',
  'öğretmen ihtiyacınız',
  'ogretmen ariyor musunuz',
  'öğretmen arıyor musunuz'
];

/** Tek başına yetmeyen, öğretmenlik bağlamıyla birleşince sayılan ipuçları. */
const ROLE_HINTS = [
  'ogretmen',
  'öğretmen',
  'ogretmenim',
  'öğretmenim',
  'egitmen',
  'eğitmen',
  'brans',
  'branş'
];

const INTENT_HINTS = [
  'basvurmak istiyorum',
  'başvurmak istiyorum',
  'basvuruda bulunmak',
  'başvuruda bulunmak',
  'is ariyorum',
  'iş arıyorum',
  'calismak istiyorum',
  'çalışmak istiyorum',
  'gorev almak istiyorum',
  'görev almak istiyorum',
  'part time',
  'yari zamanli',
  'yarı zamanlı',
  'tam zamanli',
  'tam zamanlı',
  'cv',
  'mezunuyum',
  'tecrubem',
  'tecrübem',
  'deneyimim'
];

/**
 * Veli / öğrenci mesajını başvuru sanmayı önleyen kalıplar.
 * "Öğretmenim ne zaman gelecek", "öğretmenime iletir misiniz" gibi.
 */
const NEGATIVE_PATTERNS = [
  'ogretmenim ne zaman',
  'öğretmenim ne zaman',
  'ogretmenime',
  'öğretmenime',
  'ogretmeniyle',
  'öğretmeniyle',
  'ogretmenden randevu',
  'öğretmenden randevu',
  'ogretmeni degistir',
  'öğretmeni değiştir',
  'ogretmen degisikligi',
  'öğretmen değişikliği',
  'cocugumun ogretmeni',
  'çocuğumun öğretmeni',
  'ogrencinin ogretmeni',
  'öğrencinin öğretmeni'
];

/** İyelik eki alabilen kalıplar: "öğretmeni olarak çalışmak", "eğitmen olarak başvurmak" */
const STRONG_REGEXES = [
  /(ogretmen|öğretmen|egitmen|eğitmen)\w*\s+olarak\s+(calis|çalış|basvur|başvur|gorev|görev)/,
  /(ogretmen|öğretmen)\w*\s+(kadro|pozisyon|alim|alım)/,
  /(cv|ozgecmis|özgeçmiş)\w*\s+(gonder|gönder|ilet|paylas|paylaş)/
];

function includesAny(text, list) {
  return list.filter((p) => text.includes(normalizeApplicationText(p)));
}

/**
 * Mesaj öğretmen başvurusu mu?
 * @param {string} body mesaj metni
 * @returns {{ match: boolean, confidence: 'high'|'medium'|'none', matched: string[], reason: string|null }}
 */
export function detectTeacherApplication(body) {
  const text = normalizeApplicationText(body);
  if (!text || text.length < 8) {
    return { match: false, confidence: 'none', matched: [], reason: 'too_short' };
  }

  const negatives = includesAny(text, NEGATIVE_PATTERNS);
  if (negatives.length) {
    return { match: false, confidence: 'none', matched: negatives, reason: 'looks_like_parent_message' };
  }

  const strong = includesAny(text, STRONG_PATTERNS);
  if (strong.length) {
    return { match: true, confidence: 'high', matched: strong, reason: 'strong_pattern' };
  }

  const regexHit = STRONG_REGEXES.find((re) => re.test(text));
  if (regexHit) {
    return { match: true, confidence: 'high', matched: [regexHit.source], reason: 'strong_pattern' };
  }

  const roles = includesAny(text, ROLE_HINTS);
  const intents = includesAny(text, INTENT_HINTS);
  if (roles.length && intents.length) {
    return {
      match: true,
      confidence: 'medium',
      matched: [...roles, ...intents],
      reason: 'role_and_intent'
    };
  }

  return { match: false, confidence: 'none', matched: [], reason: null };
}

/** Konuşma etiketi — gelen kutusunda rozet olarak görünür. */
export const TEACHER_APPLICATION_TAG = 'Öğretmen başvurusu';

/** Konuşma metadata'sına etiketi ekler (var olan etiketler korunur). */
export function withTeacherApplicationTag(metadata) {
  const meta = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => String(t)) : [];
  if (!tags.includes(TEACHER_APPLICATION_TAG)) tags.push(TEACHER_APPLICATION_TAG);
  meta.tags = tags;
  meta.teacher_application = true;
  return meta;
}
