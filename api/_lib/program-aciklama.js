/**
 * Kayıt formu / sözleşmede kuruma özel program açıklaması
 * (ör. "Sadece sayısal dersler", "Derslere 15 Aralık'ta başlayacak").
 *
 * Ayrı kolon yok: sözleşmenin ek detay metninin (sablon_ek_detay_snapshot) sonuna
 * "Açıklama: …" satırıyla eklenir; böylece sözleşme metninde de görünür.
 * İstemci kopyası: student-coaching-system/src/lib/programAciklama.ts
 */
export const ACIKLAMA_PREFIX = 'Açıklama: ';

/** Ek detay metnini şablon kısmı ve açıklama olarak ayırır. */
export function splitProgramAciklama(snapshot) {
  const text = String(snapshot || '');
  const re = /(^|\n\n)Açıklama: ([\s\S]*)$/;
  const m = text.match(re);
  if (!m) return { base: text.trim(), aciklama: '' };
  return { base: text.slice(0, m.index).trim(), aciklama: m[2].trim() };
}

/** Şablon metni + açıklamadan ek detay metnini kurar. */
export function composeProgramAciklama(base, aciklama) {
  const b = String(base || '').trim();
  const a = String(aciklama || '').trim();
  if (!a) return b;
  return b ? `${b}\n\n${ACIKLAMA_PREFIX}${a}` : `${ACIKLAMA_PREFIX}${a}`;
}
