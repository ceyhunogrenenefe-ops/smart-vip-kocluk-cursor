import { supabaseAdmin } from './supabase-admin.js';

export class CoachLessonsLockError extends Error {
  constructor() {
    super('coach_lessons_locked');
    this.code = 'coach_lessons_locked';
    this.userMessage =
      'Bu koç için ders ve görüşme özelliği kilitli. Yöneticinizle iletişime geçin.';
  }
}

function errText(error) {
  if (!error) return '';
  if (typeof error.message === 'string') return error.message;
  if (typeof error.details === 'string') return error.details;
  return '';
}

function isMissingLockColumn(error) {
  const t = errText(error);
  return t.includes("'lessons_meetings_locked'") && t.includes('schema cache');
}

export async function getCoachLessonsMeetingsLocked(coachId) {
  const id = String(coachId || '').trim();
  if (!id) return false;
  const { data, error } = await supabaseAdmin
    .from('coaches')
    .select('lessons_meetings_locked')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingLockColumn(error)) return false;
    throw error;
  }
  return data?.lessons_meetings_locked === true;
}

export async function assertCoachLessonsMeetingsUnlocked(coachId) {
  if (await getCoachLessonsMeetingsLocked(coachId)) {
    throw new CoachLessonsLockError();
  }
}

export async function assertStudentCoachLessonsUnlocked(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid) return;
  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('coach_id')
    .eq('id', sid)
    .maybeSingle();
  if (error) throw error;
  if (!student?.coach_id) return;
  await assertCoachLessonsMeetingsUnlocked(student.coach_id);
}
