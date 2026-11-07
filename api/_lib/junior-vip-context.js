import { supabaseAdmin } from './supabase-admin.js';
import { JUNIOR_VIP_STUDENT_NAV } from './junior-vip-student-nav.js';

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
