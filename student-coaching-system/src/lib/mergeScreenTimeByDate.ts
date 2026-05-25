/** Günlük ekran süresi: dedicated log + weekly_entries birleşimi (gün başına max dakika). */
export function mergeScreenTimeByDate(
  dedicatedLogs: Map<string, number>,
  weeklyEntries: Array<{ date?: string; screen_time_minutes?: number | null }>
): Map<string, number> {
  const out = new Map(dedicatedLogs);
  for (const row of weeklyEntries) {
    const d = String(row.date || '').slice(0, 10);
    if (!d) continue;
    const mins = Number(row.screen_time_minutes);
    if (!Number.isFinite(mins) || mins <= 0) continue;
    const prev = out.get(d) ?? 0;
    out.set(d, Math.max(prev, Math.floor(mins)));
  }
  return out;
}
