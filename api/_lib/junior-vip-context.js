import { supabaseAdmin } from './supabase-admin.js';
import { JUNIOR_VIP_STUDENT_NAV } from './junior-vip-student-nav.js';
import { JUNIOR_VIP_COACH_NAV, JUNIOR_VIP_TEACHER_NAV } from './junior-vip-nav.js';
import { getTeacherPanelClassIds, getTeacherPanelStudentScope } from './teacher-class-scope.js';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function weekBoundsUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMon = (day + 6) % 7;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMon));
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { from: isoDate(mon), to: isoDate(sun) };
}

export async function buildJuniorVipStudentContext(studentId) {
  const sid = String(studentId || '').trim();
  const today = isoDate(new Date());
  const { from, to } = weekBoundsUtc();

  const [stuRes, entriesRes, plannerRes] = await Promise.all([
    supabaseAdmin
      .from('students')
      .select('id,name,class_level,group_name,institution_id')
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
          group_name: student.group_name
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
  const today = isoDate(new Date());
  const { from, to } = weekBoundsUtc();

  const [coachRes, studentsRes, meetingsRes] = await Promise.all([
    supabaseAdmin.from('coaches').select('id,name').eq('id', cid).maybeSingle(),
    supabaseAdmin
      .from('students')
      .select('id,name,class_level,group_name')
      .eq('coach_id', cid)
      .order('name', { ascending: true })
      .limit(200),
    supabaseAdmin
      .from('meetings')
      .select('id,student_id,title,start_time,status')
      .eq('coach_id', cid)
      .gte('start_time', `${from}T00:00:00Z`)
      .lte('start_time', `${to}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(40)
  ]);

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
    if (!error) {
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
    group_name: s.group_name,
    week_solved_questions: solvedByStudent.get(String(s.id)) || 0
  }));

  const meetings = (meetingsRes.error ? [] : meetingsRes.data || []).map((m) => ({
    student: nameById.get(String(m.student_id)) || null,
    title: m.title || null,
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
    today_meetings: meetings.filter((m) => String(m.start_time || '').slice(0, 10) === today)
  };
}

/** Öğretmen paneli bağlamı — yalnızca öğretmenin kendi sınıfları ve dersleri (öğrenci adı yok). */
export async function buildJuniorVipTeacherContext({ userId, institutionId = null, displayName = '' }) {
  const tid = String(userId || '').trim();
  const today = isoDate(new Date());
  const { from, to } = weekBoundsUtc();

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
