/**
 * Canlı grup sınıflarında ders programını boşaltırken hedeflenen sınıf kodları.
 * Öğrenci / öğretmen üyeliğine dokunulmaz — yalnızca haftalık slot + gelecek oturumlar.
 */

/** @type {readonly string[]} */
export const CLEAR_SCHEDULE_CLASS_KEYS = Object.freeze([
  '5A',
  '6A',
  '6B',
  '7A',
  '8A',
  '8B',
  '8E',
  '8F'
]);

/**
 * "5-A YAZ KAMPI" / "5A" / "2026-2027 6 B SINIFI" → "5A" | "6B" | …
 * @param {unknown} name
 */
export function canonicalizeClearClassKey(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const stripped = raw
    .replace(/20\d{2}\s*[-–/]\s*20\d{2}/g, '')
    .replace(/YAZ\s*KAMPI/gi, '')
    .replace(/SINIFI?/gi, '')
    .replace(/DÖNEM[İI]?/gi, '')
    .replace(/GRUBU?/gi, '')
    .trim();
  const m = stripped.match(/(?:^|[^\d])([2-9]|1[0-2])\s*[-_]?\s*([A-Za-zÇĞİÖŞÜçğıöşü])/u);
  if (m) return `${m[1]}${m[2].toLocaleUpperCase('tr-TR')}`;
  return '';
}

/**
 * @param {{ id?: string, name?: string }[]} classes
 * @param {string} key e.g. "5A"
 * @returns {{ id: string, name: string } | null}
 */
export function matchClearTargetClass(classes, key) {
  const want = String(key || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (!want) return null;
  const list = Array.isArray(classes) ? classes : [];

  const candidates = list.filter((c) => {
    const canon = canonicalizeClearClassKey(c?.name);
    if (canon === want) return true;
    const up = String(c?.name || '').toLocaleUpperCase('tr-TR');
    const compact = up.replace(/[\s_\-./]/g, '');
    return compact === want || compact.startsWith(want);
  });
  if (!candidates.length) return null;

  // Yeni dönem / DÖNEM adını YAZ kampına tercih et (birden fazla eşleşmede)
  const score = (name) => {
    const up = String(name || '').toLocaleUpperCase('tr-TR');
    let s = 0;
    if (/20\d{2}/.test(up) || up.includes('DÖNEM') || up.includes('DÖMEM')) s += 10;
    if (up.includes('YAZ')) s -= 5;
    if (canonicalizeClearClassKey(name) === want) s += 3;
    return s;
  };
  candidates.sort((a, b) => score(b?.name) - score(a?.name));
  const best = candidates[0];
  return best?.id ? { id: String(best.id), name: String(best.name || '') } : null;
}
