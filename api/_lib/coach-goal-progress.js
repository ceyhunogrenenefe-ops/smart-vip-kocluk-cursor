/**
 * Koç haftalık hedef gerçekleşme (coach-stats için sunucu tarafı).
 * Frontend coachGoalAnalytics.ts ile uyumlu: soru hedefleri, subject eşleşmesi, dedupe.
 */
import { addCalendarDaysYmd } from './istanbul-time.js';

function clipYmd(v) {
  return String(v || '').trim().slice(0, 10);
}

function normSubject(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function goalUnitKind(g) {
  const u = String(g.quantity_unit || '')
    .trim()
    .toLowerCase();
  const sub = String(g.subject || '').trim();
  if (u === 'paragraf' || u === 'paragraflar' || sub === 'Paragraf Çözme') return 'paragraf';
  if (u === 'problem' || u === 'problemler' || sub === 'Problem Çözme') return 'problem';
  if (u === 'sayfa' || u === 'kitap' || sub === 'Kitap Okuma') return 'sayfa';
  if (u === 'dakika' || u === 'dk' || u === 'dak') return 'dakika';
  if (u === 'tekrar') return 'tekrar';
  if (u === 'soru' || u === 'sorular' || u === 'adet' || u === '') return 'soru';
  return 'other';
}

function isQuestionGoal(g) {
  const k = goalUnitKind(g);
  return k === 'soru' || k === 'tekrar';
}

function goalSpan(g) {
  const gs = clipYmd(g.goal_start_date || '');
  const ge = clipYmd(g.goal_end_date || '');
  if (gs && ge) return gs <= ge ? { gs, ge } : { gs: ge, ge: gs };
  const ws = clipYmd(g.week_start_date || '');
  if (!ws) return null;
  return { gs: ws, ge: addCalendarDaysYmd(ws, 6) };
}

function overlapsRange(g, rangeFrom, rangeTo) {
  const span = goalSpan(g);
  if (!span) return false;
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  if (!rf || !rt || rf > rt) return false;
  return span.gs <= rt && span.ge >= rf;
}

function clipRange(g, rangeFrom, rangeTo) {
  const span = goalSpan(g);
  if (!span) return null;
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const clipFrom = span.gs >= rf ? span.gs : rf;
  const clipTo = span.ge <= rt ? span.ge : rt;
  if (clipFrom > clipTo) return null;
  return { clipFrom, clipTo };
}

function dedupeGoals(goals, rangeFrom, rangeTo) {
  const byKey = new Map();
  for (const g of goals) {
    if (!overlapsRange(g, rangeFrom, rangeTo)) continue;
    const key = `${String(g.student_id)}::${normSubject(g.subject)}::${goalUnitKind(g)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, g);
      continue;
    }
    const prevStart = goalSpan(prev)?.gs ?? '';
    const nextStart = goalSpan(g)?.gs ?? '';
    const prevT = Number(prev.target_quantity) || 0;
    const nextT = Number(g.target_quantity) || 0;
    const pick =
      nextStart > prevStart ||
      (nextStart === prevStart && nextT > prevT) ||
      (nextStart === prevStart && nextT === prevT && String(g.created_at || '') > String(prev.created_at || ''))
        ? g
        : prev;
    byKey.set(key, pick);
  }
  return [...byKey.values()];
}

function completedForGoal(g, entries, rangeFrom, rangeTo) {
  const clip = clipRange(g, rangeFrom, rangeTo);
  if (!clip) return 0;
  const sub = normSubject(g.subject);
  const kind = goalUnitKind(g);
  let sum = 0;
  for (const e of entries) {
    const d = clipYmd(e.date);
    if (!d || d < clip.clipFrom || d > clip.clipTo) continue;
    if (sub && normSubject(e.subject) !== sub) continue;
    if (kind === 'sayfa') {
      sum += Number(e.pages_read || 0) || 0;
    } else if (kind === 'dakika') {
      sum += Number(e.screen_time_minutes || e.reading_minutes || 0) || 0;
    } else {
      const solved = Number(e.solved_questions) || 0;
      if (solved > 0) sum += solved;
      else {
        sum +=
          (Number(e.correct) || 0) + (Number(e.wrong) || 0) + (Number(e.blank) || 0);
      }
    }
  }
  return Math.round(sum);
}

/**
 * Öğrenci bazında hedef gerçekleşme → koç toplamları.
 * @returns {{ target: number, completed: number, studentsWithGoals: number, studentsMet: number }}
 */
export function aggregatePlannerGoalProgress(goals, entriesByStudent, rangeFrom, rangeTo) {
  const deduped = dedupeGoals(goals || [], rangeFrom, rangeTo).filter(isQuestionGoal);
  let target = 0;
  let completed = 0;
  const byStudent = new Map();

  for (const g of deduped) {
    const sid = String(g.student_id || '');
    if (!sid) continue;
    const t = Number(g.target_quantity);
    if (!Number.isFinite(t) || t <= 0) continue;
    const entries = entriesByStudent.get(sid) || [];
    const done = completedForGoal(g, entries, rangeFrom, rangeTo);
    target += t;
    completed += done;
    if (!byStudent.has(sid)) byStudent.set(sid, { target: 0, completed: 0 });
    const st = byStudent.get(sid);
    st.target += t;
    st.completed += done;
  }

  let studentsMet = 0;
  for (const st of byStudent.values()) {
    if (st.target > 0 && st.completed >= st.target) studentsMet += 1;
  }

  return {
    target: Math.round(target),
    completed: Math.round(completed),
    studentsWithGoals: byStudent.size,
    studentsMet
  };
}

export function goalOverlapsAnalysisRange(g, rangeFrom, rangeTo) {
  return overlapsRange(g, rangeFrom, rangeTo);
}
