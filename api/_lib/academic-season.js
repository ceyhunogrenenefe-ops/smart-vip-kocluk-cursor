/**
 * Geçerli eğitim-öğretim sezonu: 2026-2027 (yaz kampı dahil).
 * Sınav sonuçları ve 5'li / 10'lu karne yalnız bu tarihten sonraki denemelerle hesaplanır.
 * Yeni sezonda EDESIS_SEASON_START ortam değişkeniyle (YYYY-AA-GG) güncellenebilir.
 */
export const DEFAULT_SEASON_START = '2026-07-01';
export const DEFAULT_SEASON_LABEL = '2026-2027';

export function currentSeason() {
  const env = String(process.env.EDESIS_SEASON_START || '').trim();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(env) ? env : DEFAULT_SEASON_START;
  const y = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  // Haziran sonrası başlıyorsa sezon o yıl başlar (2026-07 → 2026-2027)
  const first = month >= 6 ? y : y - 1;
  return { start, label: env ? `${first}-${first + 1}` : DEFAULT_SEASON_LABEL };
}

/** Sınav tarihi sezonda mı? Tarihi okunamayan sonuç gizlenmez. */
export function examDateInSeason(dateLike, seasonStart = currentSeason().start) {
  const d = String(dateLike || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
  return d >= seasonStart;
}

/** "season=all" istenmediyse listeyi sezona süzer; gizlenen sayısını da döner. */
export function filterExamsToSeason(exams, { all = false, dateOf = (e) => e?.examDate ?? e?.date } = {}) {
  const season = currentSeason();
  const list = Array.isArray(exams) ? exams : [];
  if (all) return { items: list, hiddenCount: 0, season };
  const items = list.filter((e) => examDateInSeason(dateOf(e), season.start));
  return { items, hiddenCount: list.length - items.length, season };
}

export function wantsAllSeasons(req) {
  const v = String(req?.query?.season || req?.body?.season || '').trim().toLowerCase();
  return v === 'all' || v === 'tum' || v === 'tumu';
}
