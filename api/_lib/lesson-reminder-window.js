/**
 * Ders hatırlatma zaman penceresi.
 * narrow (varsayılan): ders başlamadan 7–13 dk arası (~10 dk, cron 5 dk ile uyumlu)
 * lead: ders başlamadan en fazla MAX dakika içinde (eski davranış)
 */
export function parseReminderWindowConfig(envPrefix = 'LESSON_REMINDER') {
  const globalMode = String(process.env.LESSON_REMINDER_WINDOW_MODE || '').trim().toLowerCase();
  const modeRaw = String(process.env[`${envPrefix}_WINDOW_MODE`] || globalMode || 'narrow').trim().toLowerCase();

  if (modeRaw === 'lead' || modeRaw === 'max_lead') {
    const maxMinutes = Math.max(
      5,
      Math.min(
        1440,
        Number(process.env[`${envPrefix}_MAX_LEAD_MINUTES`] || process.env.LESSON_REMINDER_MAX_LEAD_MINUTES || 45) || 45
      )
    );
    return { mode: 'lead', minMinutes: 0, maxMinutes, label: `0–${maxMinutes} dk kala` };
  }

  const minMinutes = Math.max(
    1,
    Math.min(
      55,
      Number(process.env[`${envPrefix}_MIN_MINUTES`] || process.env.LESSON_REMINDER_MIN_MINUTES || 7) || 7
    )
  );
  const maxMinutes = Math.max(
    minMinutes + 1,
    Math.min(
      120,
      Number(process.env[`${envPrefix}_MAX_MINUTES`] || process.env.LESSON_REMINDER_MAX_MINUTES || 13) || 13
    )
  );
  return { mode: 'narrow', minMinutes, maxMinutes, label: `${minMinutes}–${maxMinutes} dk kala` };
}

/** @param {number} untilStartMs ders başlangıcına kalan ms (pozitif = henüz başlamadı) */
export function isWithinReminderWindowMs(untilStartMs, windowConfig) {
  if (untilStartMs <= 0) return false;
  const untilMin = untilStartMs / 60_000;
  if (windowConfig.mode === 'lead') return untilMin > 0 && untilMin <= windowConfig.maxMinutes;
  return untilMin >= windowConfig.minMinutes && untilMin <= windowConfig.maxMinutes;
}
