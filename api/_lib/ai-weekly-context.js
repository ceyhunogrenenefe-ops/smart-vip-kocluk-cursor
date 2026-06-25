import { supabaseAdmin } from './supabase-admin.js';
import { addCalendarDaysYmd, getIstanbulDateString, isoWeekdayMon1Istanbul } from './istanbul-time.js';

function clipYmd(v) {
  return String(v || '').trim().slice(0, 10);
}

export function currentWeekRangeYmd() {
  const today = getIstanbulDateString();
  const dow = isoWeekdayMon1Istanbul(today) || 1;
  const mon = addCalendarDaysYmd(today, dow === 7 ? -6 : 1 - dow);
  const sun = addCalendarDaysYmd(mon, 6);
  return { from: mon, to: sun };
}

async function loadCoachGoalsForRange(studentId, rangeFrom, rangeTo) {
  const { data: overlap, error: e1 } = await supabaseAdmin
    .from('coach_weekly_goals')
    .select('*')
    .eq('student_id', studentId)
    .not('goal_start_date', 'is', null)
    .not('goal_end_date', 'is', null)
    .lte('goal_start_date', rangeTo)
    .gte('goal_end_date', rangeFrom)
    .order('created_at', { ascending: true });
  if (e1) throw e1;

  const { data: legacyOpen, error: e2 } = await supabaseAdmin
    .from('coach_weekly_goals')
    .select('*')
    .eq('student_id', studentId)
    .or('goal_start_date.is.null,goal_end_date.is.null')
    .order('created_at', { ascending: true });
  if (e2) throw e2;

  const legacyFiltered = (legacyOpen || []).filter((row) => {
    const ws = clipYmd(row.week_start_date);
    if (!ws) return false;
    const we = addCalendarDaysYmd(ws, 6);
    return ws <= rangeTo && we >= rangeFrom;
  });

  const map = new Map();
  for (const r of [...(overlap || []), ...legacyFiltered]) map.set(r.id, r);
  return [...map.values()];
}

function entryInRange(date, from, to) {
  const d = clipYmd(date);
  return d >= from && d <= to;
}

function goalSpan(g) {
  const gs = clipYmd(g.goal_start_date || g.week_start_date);
  let ge = clipYmd(g.goal_end_date);
  if (!ge && gs) ge = addCalendarDaysYmd(gs, 6);
  if (!gs || !ge) return null;
  return gs <= ge ? { gs, ge } : { gs: ge, ge: gs };
}

function normSubject(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function completedForGoal(goal, entries, rangeFrom, rangeTo) {
  const span = goalSpan(goal);
  const rf = span ? (span.gs > rangeFrom ? span.gs : rangeFrom) : rangeFrom;
  const rt = span ? (span.ge < rangeTo ? span.ge : rangeTo) : rangeTo;
  const subj = normSubject(goal.subject);
  const topic = normSubject(goal.topic);
  const unit = String(goal.quantity_unit || 'soru').toLowerCase();

  let sum = 0;
  for (const e of entries) {
    if (!entryInRange(e.date, rf, rt)) continue;
    if (subj && normSubject(e.subject) !== subj) continue;
    if (topic && normSubject(e.topic) !== topic) continue;

    if (unit.includes('sayfa') || unit.includes('kitap')) {
      sum += Number(e.pages_read ?? e.reading_minutes ?? 0) || 0;
    } else if (unit.includes('dakika') || unit.includes('dk')) {
      sum += Number(e.reading_minutes ?? 0) || 0;
    } else {
      sum += Number(e.solved_questions ?? 0) || 0;
    }
  }
  return Math.round(sum);
}

/** Koç hedefleri + günlük kayıtlar → AI bağlam metni */
export async function buildWeeklyCoachContext(studentId, rangeOverride = null) {
  const { from, to } = rangeOverride || currentWeekRangeYmd();

  const { data: entries, error: entErr } = await supabaseAdmin
    .from('weekly_entries')
    .select(
      'date, subject, topic, target_questions, solved_questions, correct, wrong, blank, notes, reading_minutes, pages_read, book_title'
    )
    .eq('student_id', studentId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });
  if (entErr) throw entErr;

  const goals = await loadCoachGoalsForRange(studentId, from, to);

  const { data: plannerRows } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('planner_date, subject, topic, status, coach_goal_id, planned_quantity, completed_quantity')
    .eq('student_id', studentId)
    .gte('planner_date', from)
    .lte('planner_date', to)
    .order('planner_date', { ascending: true });

  const list = entries || [];
  const totalTarget = list.reduce((n, e) => n + (Number(e.target_questions) || 0), 0);
  const totalSolved = list.reduce((n, e) => n + (Number(e.solved_questions) || 0), 0);
  const totalCorrect = list.reduce((n, e) => n + (Number(e.correct) || 0), 0);
  const totalWrong = list.reduce((n, e) => n + (Number(e.wrong) || 0), 0);
  const totalBlank = list.reduce((n, e) => n + (Number(e.blank) || 0), 0);
  const realizationRate = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;
  const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

  let coachTargetSum = 0;
  let coachCompletedSum = 0;
  const goalLines = goals.map((g) => {
    const target = Number(g.target_quantity) || 0;
    const done = completedForGoal(g, list, from, to);
    coachTargetSum += target;
    coachCompletedSum += done;
    const pct = target > 0 ? Math.round((done / target) * 100) : 0;
    const span = goalSpan(g);
    return `• ${g.subject || 'Genel'}${g.topic ? ` / ${g.topic}` : ''}: hedef ${target} ${g.quantity_unit || 'soru'}, gerçekleşen ${done} (%${pct})${span ? ` [${span.gs}–${span.ge}]` : ''}`;
  });

  const dailyLines = list.map((e) => {
    const solved = Number(e.solved_questions) || 0;
    const target = Number(e.target_questions) || 0;
    const parts = [
      `${clipYmd(e.date)} ${e.subject || '?'}`,
      e.topic ? `konu: ${e.topic}` : '',
      target ? `hedef ${target}` : '',
      solved ? `çözülen ${solved}` : '',
      solved ? `D/Y/B ${e.correct || 0}/${e.wrong || 0}/${e.blank || 0}` : '',
      e.pages_read ? `okuma ${e.pages_read} sayfa` : '',
      e.book_title ? `kitap: ${e.book_title}` : '',
      e.notes ? `not: ${String(e.notes).slice(0, 80)}` : ''
    ].filter(Boolean);
    return `  - ${parts.join(' · ')}`;
  });

  const plannerDone = (plannerRows || []).filter((p) => String(p.status || '').toLowerCase() === 'done').length;
  const plannerTotal = (plannerRows || []).length;

  const coachRealization =
    coachTargetSum > 0 ? Math.round((coachCompletedSum / coachTargetSum) * 100) : realizationRate;

  return {
    rangeFrom: from,
    rangeTo: to,
    text: [
      `Haftalık çalışma özeti (${from} – ${to}):`,
      `Günlük kayıt sayısı: ${list.length}`,
      `Toplam hedef (günlük kayıt): ${totalTarget} soru · çözülen: ${totalSolved} · gerçekleşme %${realizationRate}`,
      `Doğruluk: %${successRate} (D/Y/B ${totalCorrect}/${totalWrong}/${totalBlank})`,
      goals.length
        ? `Koç hedefleri (${goals.length} adet) — toplam kota ${coachTargetSum}, gerçekleşen ${coachCompletedSum} (%${coachRealization}):`
        : 'Bu hafta tanımlı koç hedefi yok (günlük kayıt hedefleri kullanıldı).',
      goalLines.length ? goalLines.join('\n') : '',
      plannerTotal ? `Haftalık plan takvimi: ${plannerDone}/${plannerTotal} blok tamamlandı.` : '',
      dailyLines.length ? `Günlük kayıt detayı:\n${dailyLines.join('\n')}` : 'Bu hafta günlük çalışma kaydı yok.'
    ]
      .filter(Boolean)
      .join('\n'),
    hasData: list.length > 0 || goals.length > 0 || (plannerRows || []).length > 0
  };
}
