/**
 * Instagram yorum otomasyonu — saf eşleştirme mantığı (veritabanı / ağ yok).
 *
 * "LGS", "lgs", "Lgs", "LGS'ye", "lgs!" hepsi aynı anahtar kelimeyi tutmalı;
 * "bilgisayar" gibi içinde geçen kelimeler tutmamalı. Türkçe büyük/küçük harf
 * kuralları (I/ı, İ/i) burada özellikle önemli: toLowerCase() "LGS"i doğru
 * çevirir ama "IĞDIR" gibi girdilerde İngilizce kural yanlış sonuç verir.
 */

/** Türkçe küçük harf + şapkasız + tek boşluk. */
export function normalizeForMatch(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/[âÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[ûÛ]/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Metni kelimelere böler. Kesme işareti ve noktalama ayırıcı sayılır ki
 * "lgs'ye", "lgs." ve "#lgs" de "lgs" olarak görünsün.
 */
export function tokenize(value) {
  return normalizeForMatch(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Yorum metni anahtar kelimelerden birini içeriyor mu?
 * @param {string} text yorum metni
 * @param {string[]} keywords anahtar kelimeler (büyük/küçük fark etmez)
 * @param {{ wholeWord?: boolean }} [opts] wholeWord=false ise içinde geçmesi yeter
 * @returns {string|null} eşleşen anahtar kelime (girildiği hâliyle) veya null
 */
export function matchKeyword(text, keywords, opts = {}) {
  const wholeWord = opts.wholeWord !== false;
  const list = (Array.isArray(keywords) ? keywords : [])
    .map((k) => String(k || '').trim())
    .filter(Boolean);
  if (!list.length) return null;

  const normText = normalizeForMatch(text);
  if (!normText) return null;
  const tokens = wholeWord ? new Set(tokenize(text)) : null;

  for (const keyword of list) {
    const normKey = normalizeForMatch(keyword);
    if (!normKey) continue;

    // Çok kelimeli anahtar (“lgs kampı”) her zaman metin içinde aranır
    if (normKey.includes(' ')) {
      if (normText.includes(normKey)) return keyword;
      continue;
    }
    if (wholeWord) {
      if (tokens.has(normKey)) return keyword;
      continue;
    }
    if (normText.includes(normKey)) return keyword;
  }
  return null;
}

/**
 * Bu yoruma hangi otomasyon uygulanmalı?
 *
 * Belirli bir gönderiye tanımlı otomasyon, "tüm gönderiler" otomasyonundan
 * önce gelir; aksi hâlde genel bir kural özel kuralı gölgeler. Eşit
 * durumda önce oluşturulan kazanır, davranış öngörülebilir olsun.
 *
 * @returns {{ automation: object, keyword: string } | null}
 */
export function pickAutomation(automations, { mediaId, text }) {
  const list = (Array.isArray(automations) ? automations : []).filter((a) => a && a.is_active !== false);
  if (!list.length) return null;

  const media = String(mediaId || '').trim();
  const scoped = [];
  const global = [];
  for (const a of list) {
    const target = String(a.media_id || '').trim();
    if (target) {
      if (media && target === media) scoped.push(a);
    } else {
      global.push(a);
    }
  }

  const byCreated = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''));
  for (const group of [scoped.sort(byCreated), global.sort(byCreated)]) {
    for (const automation of group) {
      const keyword = matchKeyword(text, automation.keywords, {
        wholeWord: automation.match_whole_word !== false
      });
      if (keyword) return { automation, keyword };
    }
  }
  return null;
}

/** Mesaj metnindeki yer tutucular. */
export function renderAutomationText(template, { username = '', keyword = '' } = {}) {
  return String(template || '')
    .replace(/\{\{\s*username\s*\}\}/gi, username ? `@${String(username).replace(/^@/, '')}` : '')
    .replace(/\{\{\s*keyword\s*\}\}/gi, keyword || '')
    .trim();
}
