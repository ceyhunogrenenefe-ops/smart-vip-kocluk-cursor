/** Takvim kartında konu adı görünsün; otomatik günlük kayıt önekleri konuyu gizlemesin. */

export function isAutoDailyPlannerTitle(title) {
  const t = String(title || '').trim();
  if (!t) return true;
  const low = t
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  return (
    low.startsWith('gunluk kayit:') ||
    low.startsWith('gunluk:') ||
    low.includes('gunluk kayit:') ||
    /^[\u{1F4DD}\s]*gunluk:/u.test(low)
  );
}

/** Günlük kayıt sonrası planner.title — mevcut konu başlığını koru. */
export function resolvePlannerEntryTitle(existingTitle, subject, topic) {
  const kept = String(existingTitle || '').trim();
  if (kept && !isAutoDailyPlannerTitle(kept)) return kept;
  const t = String(topic || '').trim();
  const sub = String(subject || '').trim() || 'Genel';
  return t || sub;
}
