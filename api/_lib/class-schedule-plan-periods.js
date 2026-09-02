/**
 * Planlayıcı: gün bazlı ders saat listesi.
 * Öncelik: grup.periodsByDay[di] → plan.periodsByDay[di] → grup.periods → plan.periods
 */
export function periodsForPlannerDay(group, plannerJson, di) {
  const pj = plannerJson && typeof plannerJson === 'object' ? plannerJson : {};
  const g = group && typeof group === 'object' ? group : {};
  const dk = String(di);
  if (g.periodsByDay && Array.isArray(g.periodsByDay[dk]) && g.periodsByDay[dk].length) {
    return g.periodsByDay[dk];
  }
  if (pj.periodsByDay && Array.isArray(pj.periodsByDay[dk]) && pj.periodsByDay[dk].length) {
    return pj.periodsByDay[dk];
  }
  if (Array.isArray(g.periods) && g.periods.length) return g.periods;
  if (Array.isArray(pj.periods) && pj.periods.length) return pj.periods;
  return [];
}
