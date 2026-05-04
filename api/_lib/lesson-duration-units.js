/**
 * Süre → paket “ders birimi” (tamsayı).
 *
 * Varsayılan (Türkiye tipik slotları):
 * - 1–45 dk   → 1 birim
 * - 46–80 dk  → 2 birim
 * - 81–120 dk → 3 birim
 * - 120 dk üzeri → her ek 40 dk için +1 birim (uzun seanslar)
 *
 * Özelleştirme: ortam değişkeni LESSON_DURATION_UNIT_RULES (JSON dizi), örn:
 * [{"maxMinutes":45,"units":1},{"maxMinutes":80,"units":2},{"maxMinutes":999999,"units":10}]
 * Son öğe üst sınır; daha uzun süreler için son öğenin units değeri kullanılır (basit tavan).
 */

function defaultTiersFromMinutes(m) {
  if (m <= 45) return 1;
  if (m <= 80) return 2;
  if (m <= 120) return 3;
  return 3 + Math.ceil((m - 120) / 40);
}

function parseEnvTiers() {
  const raw = process.env.LESSON_DURATION_UNIT_RULES;
  if (!raw || !String(raw).trim()) return null;
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const tiers = arr
      .map((t) => ({
        maxMinutes: Number(t.maxMinutes),
        units: Number(t.units)
      }))
      .filter((t) => Number.isFinite(t.maxMinutes) && t.maxMinutes > 0 && Number.isFinite(t.units) && t.units >= 1)
      .sort((a, b) => a.maxMinutes - b.maxMinutes);
    return tiers.length ? tiers : null;
  } catch {
    return null;
  }
}

export function lessonUnitsFromDurationMinutes(durationMinutes) {
  const rounded = Math.round(Number(durationMinutes));
  const m = Number.isFinite(rounded) ? Math.min(600, Math.max(15, rounded)) : 60;

  const tiers = parseEnvTiers();
  if (tiers) {
    for (const t of tiers) {
      if (m <= t.maxMinutes) return t.units;
    }
    return tiers[tiers.length - 1].units;
  }

  return defaultTiersFromMinutes(m);
}

/** Kota API / UI için kısa açıklama */
export function describeDefaultDurationUnitRules() {
  return 'Varsayılan: 1–45 dk → 1 birim, 46–80 dk → 2 birim, 81–120 dk → 3 birim; daha uzun seanslarda +40 dk başına +1 birim.';
}
