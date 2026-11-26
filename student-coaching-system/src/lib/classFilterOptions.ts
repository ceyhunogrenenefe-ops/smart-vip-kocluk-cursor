import { CLASS_LEVELS, formatClassLevelLabel } from '../types';
import { classLevelKey, foldTr } from './turkishSearch';

export type ClassFilterOption = { value: string; label: string };

/**
 * Sınıf filtresi seçenekleri. "5" ile "5. Sınıf", "YOS" ile "YÖS" tek seçenek olur;
 * değer classLevelKey biçimindedir, sıralama CLASS_LEVELS düzenini izler.
 */
export function buildClassFilterOptions(values: Iterable<unknown>): ClassFilterOption[] {
  const byKey = new Map<string, string>();
  for (const v of values) {
    if (v === undefined || v === null || !String(v).trim()) continue;
    const key = classLevelKey(v);
    if (key && !byKey.has(key)) byKey.set(key, String(v).trim());
  }
  const out: ClassFilterOption[] = [];
  for (const level of CLASS_LEVELS) {
    const key = classLevelKey(level.value);
    if (byKey.has(key)) {
      out.push({ value: key, label: level.label });
      byKey.delete(key);
    }
  }
  const rest = [...byKey.entries()]
    .map(([key, raw]) => ({ value: key, label: formatClassLevelLabel(raw) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
  return [...out, ...rest];
}

/** İsim önerileri (datalist) — Türkçe harf farkı gözetmeden tekilleştirir, alfabetik sıralar. */
export function uniqueNames(names: Iterable<unknown>): string[] {
  const seen = new Map<string, string>();
  for (const n of names) {
    const s = String(n ?? '').trim();
    if (!s) continue;
    const k = foldTr(s);
    if (!seen.has(k)) seen.set(k, s);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'));
}

/** "5", "5. Sınıf", "YOS" gibi değerler için okunur etiket ("5. Sınıf", "YÖS"). */
export function classLevelLabel(value: unknown): string {
  const key = classLevelKey(value);
  if (!key) return '—';
  const found = CLASS_LEVELS.find((l) => classLevelKey(l.value) === key);
  return found ? found.label : formatClassLevelLabel(String(value));
}
