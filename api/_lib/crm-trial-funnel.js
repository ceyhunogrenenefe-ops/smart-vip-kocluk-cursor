/**
 * CRM pipeline "Deneme dersi" hunisi — sınıf bazında
 *   planlanan  : dönem içinde deneme dersi aşamasına alınan lead
 *   katılan    : "Deneme dersi yapıldı" aşamasına geçen
 *   katılmayan : planlanıp yapıldıya geçmeyen
 *   kayıt olan : planlananlardan kesin kayda dönen
 */
import { GRADE_PROGRAMS, GRADE_PROGRAM_LABELS } from './registration-tracking-utils.js';

export const TRIAL_SCHEDULED = 'trial_lesson_scheduled';
export const TRIAL_COMPLETED = 'trial_lesson_completed';
const TRIAL_STAGES = new Set([TRIAL_SCHEDULED, TRIAL_COMPLETED]);

function ymd(v) {
  return String(v || '').slice(0, 10);
}

function isConfirmed(lead) {
  return lead?.primary_status === 'confirmed' || lead?.stage === 'confirmed';
}

/**
 * @param {Array<{id:string, grade_program?:string|null, stage?:string|null, primary_status?:string|null, updated_at?:string|null}>} leads
 * @param {Array<{lead_id:string, new_stage:string, changed_at:string}>} history
 * @param {string} from YYYY-MM-DD (İstanbul günü)
 * @param {string} to   YYYY-MM-DD
 * @param {(iso:string)=>string} [toIstanbulYmd] zaman damgasını İstanbul gününe çevirir
 */
export function summarizeTrialFunnel(leads, history, from, to, toIstanbulYmd = ymd) {
  const inRange = (iso) => {
    const d = toIstanbulYmd(iso);
    return d >= from && d <= to;
  };

  const planned = new Set();
  const completedEver = new Set();
  const hasTrialHistory = new Set();
  for (const h of history || []) {
    const lid = String(h.lead_id || '');
    if (!lid || !TRIAL_STAGES.has(h.new_stage)) continue;
    hasTrialHistory.add(lid);
    if (h.new_stage === TRIAL_COMPLETED) completedEver.add(lid);
    if (inRange(h.changed_at)) planned.add(lid);
  }

  const leadById = new Map((leads || []).map((l) => [String(l.id), l]));
  // Geçmiş kaydı olmadan doğrudan deneme aşamasında duranlar (eski veri / içe aktarma)
  for (const l of leads || []) {
    const lid = String(l.id);
    if (hasTrialHistory.has(lid) || !l.updated_at) continue;
    if (TRIAL_STAGES.has(l.stage) && inRange(l.updated_at)) {
      planned.add(lid);
      if (l.stage === TRIAL_COMPLETED) completedEver.add(lid);
    }
  }

  const byGrade = new Map();
  const bucket = (code) => {
    if (!byGrade.has(code)) {
      byGrade.set(code, { planned: 0, attended: 0, not_attended: 0, registered: 0, registered_attended: 0 });
    }
    return byGrade.get(code);
  };

  for (const lid of planned) {
    const lead = leadById.get(lid);
    if (!lead) continue;
    const code = lead.grade_program || 'unspecified';
    const b = bucket(code);
    const attended = completedEver.has(lid);
    const registered = isConfirmed(lead);
    b.planned += 1;
    if (attended) b.attended += 1;
    else b.not_attended += 1;
    if (registered) b.registered += 1;
    if (registered && attended) b.registered_attended += 1;
  }

  const order = new Map(GRADE_PROGRAMS.map((g) => [g.code, g.sortOrder]));
  const pct = (n, d) => (d > 0 ? Math.round((1000 * n) / d) / 10 : null);

  const rows = [...byGrade.entries()]
    .map(([code, b]) => ({
      grade: code,
      label: GRADE_PROGRAM_LABELS[code] || code,
      ...b,
      attend_rate: pct(b.attended, b.planned),
      register_rate: pct(b.registered, b.planned)
    }))
    .sort((a, b) => (order.get(a.grade) ?? 999) - (order.get(b.grade) ?? 999));

  const totals = rows.reduce(
    (t, r) => ({
      planned: t.planned + r.planned,
      attended: t.attended + r.attended,
      not_attended: t.not_attended + r.not_attended,
      registered: t.registered + r.registered,
      registered_attended: t.registered_attended + r.registered_attended
    }),
    { planned: 0, attended: 0, not_attended: 0, registered: 0, registered_attended: 0 }
  );

  return {
    by_grade: rows,
    totals: {
      ...totals,
      attend_rate: pct(totals.attended, totals.planned),
      register_rate: pct(totals.registered, totals.planned)
    }
  };
}
