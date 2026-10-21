/** Yazılıya hazırlık rafları: 2 dönem × 2 yazılı × 3 çalışma. */

export const DONEMLER = [1, 2];
export const YAZILILAR = [1, 2];
export const CALISMALAR = [1, 2, 3];
export const MAX_PDF_BYTES = 100 * 1024 * 1024;

export function parseSlot(input) {
  const donem = Number(input?.donem);
  const yazili = Number(input?.yazili);
  const calisma = Number(input?.calisma);
  if (!DONEMLER.includes(donem) || !YAZILILAR.includes(yazili) || !CALISMALAR.includes(calisma)) {
    return null;
  }
  return { donem, yazili, calisma };
}

export function temizKonu(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 80) return '';
  return s;
}

export function guvenliPdfAdi(value) {
  const base = String(value || 'calisma.pdf')
    .split(/[/\\]/)
    .pop()
    .replace(/[^\w.\-ğüşöçıİĞÜŞÖÇ ]+/gi, '')
    .trim()
    .slice(0, 80);
  const withExt = /\.pdf$/i.test(base) ? base : `${base || 'calisma'}.pdf`;
  return withExt.replace(/\s+/g, '-');
}

export function yuklemeYolu(teacherId, classId, slot, fileName) {
  const safeTeacher = String(teacherId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeClass = String(classId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const ad = guvenliPdfAdi(fileName).replace(/[^a-zA-Z0-9._-]/g, '');
  return `yh/${safeTeacher}/${safeClass}/${slot.donem}-${slot.yazili}-${slot.calisma}/${Date.now()}-${ad}`;
}

export function yolBuOgretmeneAit(path, teacherId, classId, slot) {
  const safeTeacher = String(teacherId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeClass = String(classId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const p = String(path || '');
  const prefix = `yh/${safeTeacher}/${safeClass}/${slot.donem}-${slot.yazili}-${slot.calisma}/`;
  return p.startsWith(prefix) && p.endsWith('.pdf') && !p.includes('..');
}
