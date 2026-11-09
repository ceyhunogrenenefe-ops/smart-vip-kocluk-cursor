import { supabaseAdmin } from './supabase-admin.js';
import { JUNIOR_VIP_STUDENT_NAV } from './junior-vip-student-nav.js';
import { JUNIOR_VIP_COACH_NAV, JUNIOR_VIP_TEACHER_NAV } from './junior-vip-nav.js';
import { getTeacherPanelClassIds, getTeacherPanelStudentScope } from './teacher-class-scope.js';
import { istanbulToday, weekRangeYmd } from './junior-vip-dates.js';
import { getIstanbulDateString } from './istanbul-time.js';

/** Bugün ve bu hafta — Europe/Istanbul takvimine göre (UTC değil; gece yarısı kayması olmasın). */
function todayAndWeek() {
  const today = istanbulToday();
  return { today, ...weekRangeYmd(today) };
}

function istanbulDateOfTimestamp(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts || '').slice(0, 10) : getIstanbulDateString(d);
}

export async function buildJuniorVipStudentContext(studentId) {
  const sid = String(studentId || '').trim();
  const { today, from, to } = todayAndWeek();

  const [stuRes, entriesRes, plannerRes] = await Promise.all([
    supabaseAdmin
      .from('students')
      .select('id,name,class_level,branch,institution_id')
      .eq('id', sid)
      .maybeSingle(),
    supabaseAdmin
      .from('weekly_entries')
      .select('id,date,subject,topic,solved_questions,correct,wrong,blank')
      .eq('student_id', sid)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .limit(40),
    supabaseAdmin
      .from('weekly_planner_entries')
      .select('id,planner_date,title,subject,start_time,end_time,planned_quantity,completed_quantity,status')
      .eq('student_id', sid)
      .gte('planner_date', from)
      .lte('planner_date', to)
      .order('planner_date', { ascending: true })
      .limit(60)
  ]);

  const student = stuRes.data || null;
  const weekEntries = entriesRes.error ? [] : entriesRes.data || [];
  const planner = plannerRes.error ? [] : plannerRes.data || [];
  const todayEntries = weekEntries.filter((e) => String(e.date).slice(0, 10) === today);

  return {
    panel: 'student',
    student: student
      ? {
          id: student.id,
          name: student.name,
          class_level: student.class_level,
          group_name: student.branch ?? null
        }
      : { id: sid },
    today,
    week_range: { from, to },
    nav: JUNIOR_VIP_STUDENT_NAV,
    today_entries: todayEntries,
    week_entries_sample: weekEntries.slice(0, 15),
    week_planner_blocks: planner.slice(0, 20)
  };
}

/** Koç paneli bağlamı — yalnızca bu koça atanmış öğrenciler ve koçun kendi görüşmeleri. */
export async function buildJuniorVipCoachContext({ coachId, displayName = '' }) {
  const cid = String(coachId || '').trim();
  const { today, from, to } = todayAndWeek();

  const [coachRes, studentsRes, meetingsRes] = await Promise.all([
    supabaseAdmin.from('coaches').select('id,name').eq('id', cid).maybeSingle(),
    supabaseAdmin
      .from('students')
      .select('id,name,class_level,branch')
      .eq('coach_id', cid)
      .order('name', { ascending: true })
      .limit(200),
    supabaseAdmin
      .from('meetings')
      .select('id,student_id,start_time,end_time,status')
      .eq('coach_id', cid)
      .gte('start_time', `${from}T00:00:00+03:00`)
      .lte('start_time', `${to}T23:59:59+03:00`)
      .order('start_time', { ascending: true })
      .limit(40)
  ]);

  for (const [name, r] of [['coaches', coachRes], ['students', studentsRes], ['meetings', meetingsRes]]) {
    if (r.error) console.error('[junior-vip] coach context', name, r.error.message);
  }
  const students = studentsRes.error ? [] : studentsRes.data || [];
  const ids = students.map((s) => s.id);
  const nameById = new Map(students.map((s) => [String(s.id), s.name]));

  const solvedByStudent = new Map();
  if (ids.length) {
    const { data: entries, error } = await supabaseAdmin
      .from('weekly_entries')
      .select('student_id,solved_questions')
      .in('student_id', ids)
      .gte('date', from)
      .lte('date', to)
      .limit(5000);
    if (error) console.error('[junior-vip] coach context weekly_entries', error.message);
    else {
      for (const e of entries || []) {
        const k = String(e.student_id);
        solvedByStudent.set(k, (solvedByStudent.get(k) || 0) + (Number(e.solved_questions) || 0));
      }
    }
  }

  const studentSummaries = students.map((s) => ({
    id: s.id,
    name: s.name,
    class_level: s.class_level,
    group_name: s.branch ?? null,
    week_solved_questions: solvedByStudent.get(String(s.id)) || 0
  }));

  const meetings = (meetingsRes.error ? [] : meetingsRes.data || []).map((m) => ({
    student: nameById.get(String(m.student_id)) || null,
    start_time: m.start_time,
    status: m.status
  }));

  return {
    panel: 'coach',
    coach: { id: cid, name: coachRes.data?.name || displayName || null },
    today,
    week_range: { from, to },
    nav: JUNIOR_VIP_COACH_NAV,
    student_count: students.length,
    students: studentSummaries.slice(0, 80),
    students_without_entries_this_week: studentSummaries
      .filter((s) => !s.week_solved_questions)
      .map((s) => s.name)
      .slice(0, 40),
    week_meetings: meetings,
    today_meetings: meetings.filter((m) => istanbulDateOfTimestamp(m.start_time) === today)
  };
}

/** Öğretmen paneli bağlamı — yalnızca öğretmenin kendi sınıfları ve dersleri (öğrenci adı yok). */
export async function buildJuniorVipTeacherContext({ userId, institutionId = null, displayName = '' }) {
  const tid = String(userId || '').trim();
  const { today, from, to } = todayAndWeek();

  let classIds = [];
  try {
    classIds = await getTeacherPanelClassIds(tid);
  } catch {
    classIds = [];
  }

  const [classesRes, sessionsRes, userRes] = await Promise.all([
    classIds.length
      ? supabaseAdmin.from('classes').select('id,name').in('id', classIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from('class_sessions')
      .select('id,class_id,subject,lesson_date,start_time,end_time,status')
      .eq('teacher_id', tid)
      .gte('lesson_date', from)
      .lte('lesson_date', to)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(60),
    supabaseAdmin.from('users').select('name').eq('id', tid).maybeSingle()
  ]);

  for (const [name, r] of [['classes', classesRes], ['class_sessions', sessionsRes], ['users', userRes]]) {
    if (r?.error) console.error('[junior-vip] teacher context', name, r.error.message);
  }
  const classes = classesRes.error ? [] : classesRes.data || [];
  const classNameById = new Map(classes.map((c) => [String(c.id), c.name]));
  const sessions = (sessionsRes.error ? [] : sessionsRes.data || []).map((s) => ({
    class: classNameById.get(String(s.class_id)) || null,
    subject: s.subject,
    lesson_date: s.lesson_date,
    start_time: s.start_time,
    end_time: s.end_time,
    status: s.status
  }));

  let studentCount = null;
  try {
    const scope = await getTeacherPanelStudentScope(tid, institutionId);
    studentCount = scope.ids.length;
  } catch {
    studentCount = null;
  }

  return {
    panel: 'teacher',
    teacher: { name: userRes?.data?.name || displayName || null },
    today,
    week_range: { from, to },
    nav: JUNIOR_VIP_TEACHER_NAV,
    classes: classes.map((c) => c.name).filter(Boolean),
    student_count: studentCount,
    week_sessions: sessions.slice(0, 40),
    today_sessions: sessions.filter((s) => String(s.lesson_date || '').slice(0, 10) === today)
  };
}

/** Panel kapsamına göre bağlam. */
export async function buildJuniorVipContext(scope) {
  if (scope.panel === 'coach') return buildJuniorVipCoachContext(scope);
  if (scope.panel === 'teacher') return buildJuniorVipTeacherContext(scope);
  return buildJuniorVipStudentContext(scope.studentId);
}
