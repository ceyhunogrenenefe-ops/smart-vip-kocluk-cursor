/**
 * Günlük rapor hatırlatması: öğrenci bugün doğru/yanlış/boş dökümünü girmemişse true.
 * @param {Array<{ student_id: string, correct?: number, wrong?: number, blank?: number, solved_questions?: number }>} entriesToday
 * @param {Set<string>} plannerStudentIds — bugün takvimde en az bir blok olan öğrenciler
 */
export function studentNeedsReportReminder(studentId, entriesToday, plannerStudentIds) {
  const sid = String(studentId || '').trim();
  if (!sid) return false;

  const rows = (entriesToday || []).filter((e) => String(e.student_id) === sid);
  const breakdown = rows.reduce(
    (sum, e) => sum + (Number(e.correct) || 0) + (Number(e.wrong) || 0) + (Number(e.blank) || 0),
    0
  );
  if (breakdown > 0) return false;

  const solved = rows.reduce((sum, e) => sum + (Number(e.solved_questions) || 0), 0);
  const hasPlannerToday = plannerStudentIds.has(sid);

  if (rows.length === 0) {
    return hasPlannerToday || true;
  }

  return solved > 0 || hasPlannerToday;
}
