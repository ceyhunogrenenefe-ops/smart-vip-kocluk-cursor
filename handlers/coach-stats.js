/**
 * Admin / süper admin — koç bazlı performans KPI’ları
 * GET /api/coach-stats?from=YYYY-MM-DD&to=YYYY-MM-DD&institution_id=
 *
 * - report_fill_rate: günlük rapor doldurma (öğrenci×gün)
 * - attendance_rate: grup canlı ders yoklama (present / kayıtlar)
 * - deneme_entry_rate: dönemde ≥1 exam_results olan öğrenci oranı
 * - deneme_join_rate: Akademik Merkez BBB deneme oda giriş oranı
 * - planner_goal_rate: haftalık plan (koç hedefi) gerçekleşme
 * - meeting_completion_rate: koç görüşmeleri completed / (planned+completed+missed)
 */
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorRoleSet,
  actorIsAdminLike,
  roleSetHasSuperAdmin
} from '../api/_lib/actor-roles.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { isUuid } from '../api/_lib/uuid.js';
import { isMissingTableError, isSchemaColumnError } from '../api/_lib/supabase-schema.js';
import { aggregatePlannerGoalProgress } from '../api/_lib/coach-goal-progress.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const CHUNK = 200;

function padYmd(v) {
  return String(v || '').trim().slice(0, 10);
}

function daysInclusive(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addCalendarDaysYmd(cur, 1);
    guard += 1;
  }
  return out;
}

function pct(num, den) {
  if (!den || den <= 0) return null;
  return Math.round((1000 * num) / den) / 10;
}

function entryFilled(row) {
  const breakdown =
    (Number(row.correct) || 0) + (Number(row.wrong) || 0) + (Number(row.blank) || 0);
  if (breakdown > 0) return true;
  if ((Number(row.solved_questions) || 0) > 0) return true;
  const extra =
    (Number(row.reading_minutes) || 0) +
    (Number(row.pages_read) || 0) +
    (Number(row.screen_time_minutes) || 0);
  return extra > 0;
}

async function fetchInChunks(ids, run) {
  const list = [...ids];
  const all = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    if (!chunk.length) continue;
    const rows = await run(chunk);
    if (rows?.length) all.push(...rows);
  }
  return all;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const actor = requireAuthenticatedActor(req);
    const roleSet = await actorRoleSet(actor);
    if (!actorIsAdminLike(actor, roleSet)) {
      return res.status(403).json({ error: 'Yalnızca admin / süper admin erişebilir.' });
    }

    const today = getIstanbulDateString();
    let to = padYmd(req.query?.to) || today;
    let from = padYmd(req.query?.from) || addCalendarDaysYmd(to, -6);
    if (!YMD.test(from) || !YMD.test(to)) {
      return res.status(400).json({ error: 'from/to YYYY-MM-DD olmalı.' });
    }
    if (from > to) {
      const t = from;
      from = to;
      to = t;
    }

    let institutionId = String(req.query?.institution_id || '').trim();
    if (!institutionId) institutionId = String(actor.institution_id || '').trim();

    if (!roleSetHasSuperAdmin(roleSet)) {
      if (!institutionId || !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'Kurum erişimi yok.' });
      }
    } else if (institutionId && !isUuid(institutionId)) {
      return res.status(400).json({ error: 'Geçersiz institution_id.' });
    }

    let coachesQ = supabaseAdmin
      .from('coaches')
      .select('id,name,email,institution_id')
      .order('name', { ascending: true });
    if (institutionId) coachesQ = coachesQ.eq('institution_id', institutionId);
    const { data: coaches, error: coachesErr } = await coachesQ;
    if (coachesErr) throw coachesErr;

    let studentsQ = supabaseAdmin
      .from('students')
      .select('id,name,coach_id,institution_id')
      .not('coach_id', 'is', null);
    if (institutionId) studentsQ = studentsQ.eq('institution_id', institutionId);
    const { data: students, error: studentsErr } = await studentsQ;
    if (studentsErr) throw studentsErr;

    const coachList = coaches || [];
    const studentList = (students || []).filter((s) => s.coach_id);
    const studentIds = studentList.map((s) => String(s.id));
    const coachByStudent = new Map(studentList.map((s) => [String(s.id), String(s.coach_id)]));
    const studentsByCoach = new Map();
    for (const s of studentList) {
      const cid = String(s.coach_id);
      if (!studentsByCoach.has(cid)) studentsByCoach.set(cid, []);
      studentsByCoach.get(cid).push(s);
    }

    const dayList = daysInclusive(from, to);
    const dayCount = dayList.length || 1;

    /** @type {Map<string, Set<string>>} coachId -> filled "studentId|date" */
    const filledKeysByCoach = new Map();
    /** @type {Map<string, number>} */
    const solvedByCoach = new Map();
    /** @type {Map<string, Set<string>>} coachId -> students who filled at least once */
    const filledStudentsByCoach = new Map();
    /** @type {Map<string, object[]>} student_id -> weekly entry rows (hedef için) */
    const entriesByStudent = new Map();

    if (studentIds.length) {
      let entryRows = [];
      try {
        entryRows = await fetchInChunks(studentIds, async (chunk) => {
          const { data, error } = await supabaseAdmin
            .from('weekly_entries')
            .select(
              'student_id,date,subject,correct,wrong,blank,solved_questions,reading_minutes,pages_read,screen_time_minutes'
            )
            .in('student_id', chunk)
            .gte('date', from)
            .lte('date', to);
          if (error) {
            if (String(error.message || '').includes('screen_time_minutes')) {
              const { data: d2, error: e2 } = await supabaseAdmin
                .from('weekly_entries')
                .select(
                  'student_id,date,subject,correct,wrong,blank,solved_questions,reading_minutes,pages_read'
                )
                .in('student_id', chunk)
                .gte('date', from)
                .lte('date', to);
              if (e2) throw e2;
              return d2 || [];
            }
            throw error;
          }
          return data || [];
        });
      } catch (e) {
        if (!isMissingTableError(e, 'weekly_entries')) throw e;
        entryRows = [];
      }

      for (const row of entryRows) {
        const sid = String(row.student_id || '');
        if (!sid) continue;
        if (!entriesByStudent.has(sid)) entriesByStudent.set(sid, []);
        entriesByStudent.get(sid).push(row);

        const cid = coachByStudent.get(sid);
        if (!cid) continue;
        const date = padYmd(row.date);
        if (!date) continue;
        if (!entryFilled(row)) continue;

        if (!filledKeysByCoach.has(cid)) filledKeysByCoach.set(cid, new Set());
        filledKeysByCoach.get(cid).add(`${sid}|${date}`);

        if (!filledStudentsByCoach.has(cid)) filledStudentsByCoach.set(cid, new Set());
        filledStudentsByCoach.get(cid).add(sid);

        const solved =
          (Number(row.solved_questions) || 0) ||
          (Number(row.correct) || 0) + (Number(row.wrong) || 0) + (Number(row.blank) || 0);
        solvedByCoach.set(cid, (solvedByCoach.get(cid) || 0) + solved);
      }
    }

    /** Haftalık plan / koç hedefi gerçekleşme */
    const plannerByCoach = new Map();
    try {
      if (studentIds.length) {
        let goalRows = [];
        try {
          goalRows = await fetchInChunks(studentIds, async (chunk) => {
            const { data: overlap, error: e1 } = await supabaseAdmin
              .from('coach_weekly_goals')
              .select(
                'id,student_id,coach_id,subject,quantity_unit,target_quantity,week_start_date,goal_start_date,goal_end_date,created_at'
              )
              .in('student_id', chunk)
              .not('goal_start_date', 'is', null)
              .not('goal_end_date', 'is', null)
              .lte('goal_start_date', to)
              .gte('goal_end_date', from);
            if (e1) throw e1;

            const { data: legacyOpen, error: e2 } = await supabaseAdmin
              .from('coach_weekly_goals')
              .select(
                'id,student_id,coach_id,subject,quantity_unit,target_quantity,week_start_date,goal_start_date,goal_end_date,created_at'
              )
              .in('student_id', chunk)
              .or('goal_start_date.is.null,goal_end_date.is.null');
            if (e2) throw e2;

            const legacyFiltered = (legacyOpen || []).filter((row) => {
              const ws = padYmd(row.week_start_date);
              if (!ws) return false;
              const we = addCalendarDaysYmd(ws, 6);
              return ws <= to && we >= from;
            });
            const map = new Map();
            for (const r of [...(overlap || []), ...legacyFiltered]) map.set(r.id, r);
            return [...map.values()];
          });
        } catch (ge) {
          if (
            isSchemaColumnError(ge, 'goal_start_date') ||
            isSchemaColumnError(ge, 'goal_end_date')
          ) {
            goalRows = await fetchInChunks(studentIds, async (chunk) => {
              const { data, error } = await supabaseAdmin
                .from('coach_weekly_goals')
                .select(
                  'id,student_id,coach_id,subject,quantity_unit,target_quantity,week_start_date,created_at'
                )
                .in('student_id', chunk)
                .gte('week_start_date', from)
                .lte('week_start_date', to);
              if (error) throw error;
              return (data || []).filter((row) => {
                const ws = padYmd(row.week_start_date);
                if (!ws) return false;
                const we = addCalendarDaysYmd(ws, 6);
                return ws <= to && we >= from;
              });
            });
          } else if (isMissingTableError(ge, 'coach_weekly_goals')) {
            goalRows = [];
          } else {
            throw ge;
          }
        }

        const goalsByCoach = new Map();
        for (const g of goalRows) {
          const sid = String(g.student_id || '');
          const cid = String(g.coach_id || '') || coachByStudent.get(sid) || '';
          if (!cid) continue;
          if (!goalsByCoach.has(cid)) goalsByCoach.set(cid, []);
          goalsByCoach.get(cid).push(g);
        }

        for (const [cid, goals] of goalsByCoach) {
          const studentSet = new Set(goals.map((g) => String(g.student_id)));
          const entriesSubset = new Map();
          for (const sid of studentSet) {
            entriesSubset.set(sid, entriesByStudent.get(sid) || []);
          }
          plannerByCoach.set(cid, aggregatePlannerGoalProgress(goals, entriesSubset, from, to));
        }
      }
    } catch (e) {
      if (!isMissingTableError(e, 'coach_weekly_goals')) {
        console.warn('[coach-stats] planner goals:', errorMessage(e));
      }
    }

    /** attendance: present / total marked */
    const attPresent = new Map();
    const attTotal = new Map();
    try {
      let sessionsQ = supabaseAdmin
        .from('class_sessions')
        .select('id,lesson_date,institution_id,status')
        .gte('lesson_date', from)
        .lte('lesson_date', to);
      if (institutionId) sessionsQ = sessionsQ.eq('institution_id', institutionId);
      const { data: sessions, error: sessErr } = await sessionsQ;
      if (sessErr) throw sessErr;
      const sessionIds = (sessions || [])
        .filter((s) => String(s.status || '') !== 'cancelled')
        .map((s) => String(s.id));

      if (sessionIds.length && studentIds.length) {
        const attRows = await fetchInChunks(sessionIds, async (chunk) => {
          const { data, error } = await supabaseAdmin
            .from('class_session_attendance')
            .select('session_id,student_id,status')
            .in('session_id', chunk);
          if (error) throw error;
          return data || [];
        });
        for (const row of attRows) {
          const sid = String(row.student_id || '');
          const cid = coachByStudent.get(sid);
          if (!cid) continue;
          const st = String(row.status || '').toLowerCase();
          if (!['present', 'absent', 'late'].includes(st)) continue;
          attTotal.set(cid, (attTotal.get(cid) || 0) + 1);
          if (st === 'present' || st === 'late') {
            attPresent.set(cid, (attPresent.get(cid) || 0) + 1);
          }
        }
      }
    } catch (e) {
      if (
        !isMissingTableError(e, 'class_sessions') &&
        !isMissingTableError(e, 'class_session_attendance')
      ) {
        console.warn('[coach-stats] attendance:', errorMessage(e));
      }
    }

    /** deneme: ≥1 exam_results in range */
    const examStudentsByCoach = new Map();
    try {
      if (studentIds.length) {
        const examRows = await fetchInChunks(studentIds, async (chunk) => {
          const { data, error } = await supabaseAdmin
            .from('exam_results')
            .select('student_id,date')
            .in('student_id', chunk)
            .gte('date', from)
            .lte('date', to);
          if (error) throw error;
          return data || [];
        });
        for (const row of examRows) {
          const sid = String(row.student_id || '');
          const cid = coachByStudent.get(sid);
          if (!cid) continue;
          if (!examStudentsByCoach.has(cid)) examStudentsByCoach.set(cid, new Set());
          examStudentsByCoach.get(cid).add(sid);
        }
      }
    } catch (e) {
      if (!isMissingTableError(e, 'exam_results')) {
        console.warn('[coach-stats] exam_results:', errorMessage(e));
      }
    }

    /** BBB deneme oda girişi (academic_deneme_join_logs) */
    const denemeJoinByCoach = new Map();
    try {
      if (studentIds.length) {
        const joinRows = await fetchInChunks(studentIds, async (chunk) => {
          const { data, error } = await supabaseAdmin
            .from('academic_deneme_join_logs')
            .select('student_id,istanbul_date')
            .in('student_id', chunk)
            .eq('kind', 'exam')
            .gte('istanbul_date', from)
            .lte('istanbul_date', to);
          if (error) throw error;
          return data || [];
        });
        for (const row of joinRows) {
          const sid = String(row.student_id || '');
          const cid = coachByStudent.get(sid);
          if (!cid) continue;
          if (!denemeJoinByCoach.has(cid)) denemeJoinByCoach.set(cid, new Set());
          denemeJoinByCoach.get(cid).add(sid);
        }
      }
    } catch (e) {
      if (!isMissingTableError(e, 'academic_deneme_join_logs')) {
        console.warn('[coach-stats] deneme join logs:', errorMessage(e));
      }
    }

    /** meetings */
    const meetDone = new Map();
    const meetTotal = new Map();
    try {
      const coachIds = coachList.map((c) => String(c.id));
      if (coachIds.length) {
        const fromIso = `${from}T00:00:00+03:00`;
        const toIso = `${to}T23:59:59+03:00`;
        const meetRows = await fetchInChunks(coachIds, async (chunk) => {
          const { data, error } = await supabaseAdmin
            .from('meetings')
            .select('coach_id,status,start_time')
            .in('coach_id', chunk)
            .gte('start_time', fromIso)
            .lte('start_time', toIso);
          if (error) throw error;
          return data || [];
        });
        for (const row of meetRows) {
          const cid = String(row.coach_id || '');
          const st = String(row.status || '').toLowerCase();
          if (!['planned', 'completed', 'missed'].includes(st)) continue;
          meetTotal.set(cid, (meetTotal.get(cid) || 0) + 1);
          if (st === 'completed') meetDone.set(cid, (meetDone.get(cid) || 0) + 1);
        }
      }
    } catch (e) {
      if (!isMissingTableError(e, 'meetings')) {
        console.warn('[coach-stats] meetings:', errorMessage(e));
      }
    }

    const coachesOut = coachList.map((c) => {
      const cid = String(c.id);
      const roster = studentsByCoach.get(cid) || [];
      const studentCount = roster.length;
      const expectedFillSlots = studentCount * dayCount;
      const filledSlots = filledKeysByCoach.get(cid)?.size || 0;
      const filledStudents = filledStudentsByCoach.get(cid)?.size || 0;
      const examStudents = examStudentsByCoach.get(cid)?.size || 0;
      const joinStudents = denemeJoinByCoach.get(cid)?.size || 0;
      const planner = plannerByCoach.get(cid) || {
        target: 0,
        completed: 0,
        studentsWithGoals: 0,
        studentsMet: 0
      };
      const attP = attPresent.get(cid) || 0;
      const attT = attTotal.get(cid) || 0;
      const mDone = meetDone.get(cid) || 0;
      const mTot = meetTotal.get(cid) || 0;
      const reportFillRate = pct(filledSlots, expectedFillSlots);
      const attendanceRate = pct(attP, attT);
      const denemeEntryRate = pct(examStudents, studentCount);
      const denemeJoinRate = pct(joinStudents, studentCount);
      const plannerGoalRate = pct(planner.completed, planner.target);
      const plannerStudentsMetRate = pct(planner.studentsMet, planner.studentsWithGoals);
      const meetingCompletionRate = pct(mDone, mTot);
      const reportStudentsRate = pct(filledStudents, studentCount);
      const solvedTotal = solvedByCoach.get(cid) || 0;
      const avgSolvedPerStudent =
        studentCount > 0 ? Math.round((10 * solvedTotal) / studentCount) / 10 : null;

      const rates = [
        reportFillRate,
        attendanceRate,
        denemeJoinRate ?? denemeEntryRate,
        plannerGoalRate
      ].filter((x) => x != null);
      const compositeScore =
        rates.length > 0
          ? Math.round((10 * rates.reduce((a, b) => a + b, 0)) / rates.length) / 10
          : null;

      return {
        coach_id: cid,
        coach_name: c.name || 'Koç',
        coach_email: c.email || null,
        institution_id: c.institution_id || null,
        student_count: studentCount,
        report_fill_rate: reportFillRate,
        report_filled_slots: filledSlots,
        report_expected_slots: expectedFillSlots,
        report_students_rate: reportStudentsRate,
        report_students_filled: filledStudents,
        attendance_rate: attendanceRate,
        attendance_present: attP,
        attendance_total: attT,
        deneme_entry_rate: denemeEntryRate,
        deneme_students: examStudents,
        deneme_join_rate: denemeJoinRate,
        deneme_join_students: joinStudents,
        planner_goal_rate: plannerGoalRate,
        planner_goal_completed: planner.completed,
        planner_goal_target: planner.target,
        planner_students_met_rate: plannerStudentsMetRate,
        planner_students_with_goals: planner.studentsWithGoals,
        planner_students_met: planner.studentsMet,
        meeting_completion_rate: meetingCompletionRate,
        meetings_completed: mDone,
        meetings_total: mTot,
        avg_solved_per_student: avgSolvedPerStudent,
        solved_total: solvedTotal,
        composite_score: compositeScore
      };
    });

    coachesOut.sort((a, b) => {
      const sa = a.composite_score ?? -1;
      const sb = b.composite_score ?? -1;
      if (sb !== sa) return sb - sa;
      return String(a.coach_name).localeCompare(String(b.coach_name), 'tr');
    });

    const withStudents = coachesOut.filter((c) => c.student_count > 0);
    const avgOf = (key) => {
      const vals = withStudents.map((c) => c[key]).filter((v) => v != null);
      if (!vals.length) return null;
      return Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10;
    };

    return res.status(200).json({
      from,
      to,
      day_count: dayCount,
      institution_id: institutionId || null,
      summary: {
        coach_count: coachesOut.length,
        student_count: studentList.length,
        avg_report_fill_rate: avgOf('report_fill_rate'),
        avg_attendance_rate: avgOf('attendance_rate'),
        avg_deneme_entry_rate: avgOf('deneme_entry_rate'),
        avg_deneme_join_rate: avgOf('deneme_join_rate'),
        avg_planner_goal_rate: avgOf('planner_goal_rate'),
        avg_meeting_completion_rate: avgOf('meeting_completion_rate'),
        avg_composite_score: avgOf('composite_score')
      },
      coaches: coachesOut,
      metric_notes: {
        report_fill_rate:
          'Doldurulan öğrenci×gün / (öğrenci sayısı × gün sayısı). Anlamlı soru/okuma/ekran girişi dolu sayılır.',
        attendance_rate:
          'Grup canlı ders yoklamasında present+late / tüm işaretlenen kayıtlar.',
        deneme_entry_rate:
          'Dönemde en az 1 deneme sonucu (exam_results) olan öğrenci oranı.',
        deneme_join_rate:
          'Akademik Merkez BBB deneme odasına en az 1 kez giren öğrenci oranı (academic_deneme_join_logs).',
        planner_goal_rate:
          'Koç haftalık soru hedeflerinde gerçekleşen / hedef (subject eşleşmeli weekly_entries).',
        meeting_completion_rate:
          'Koç–öğrenci görüşmelerinde completed / (planned+completed+missed).'
      }
    });
  } catch (e) {
    console.error('[coach-stats]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) || 'İstatistik alınamadı.' });
  }
}
