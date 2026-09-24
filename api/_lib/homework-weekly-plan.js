/**
 * Ödev → haftalık plan köprüsü.
 *
 * Yayımlanan ödev, hedef öğrencilerin haftalık planına tek satır olarak düşer.
 * Satır `weekly_planner_entries.homework_id` ile ödeve bağlıdır; (student_id, homework_id)
 * benzersiz olduğu için aynı ödev iki kez düşmez.
 *
 * Taslağa çekilen veya silinen ödevin satırları temizlenir. Öğrencinin kendi
 * girdiği plan satırlarına dokunulmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

const DEFAULT_START = '19:00';

/** Ödev için varsayılan çalışma aralığı: süre hedefi varsa ona göre, yoksa bir saat. */
function planTimes(targetMinutes) {
  const minutes = Number(targetMinutes);
  const span = Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.max(minutes, 15), 240) : 60;
  const [h, m] = DEFAULT_START.split(':').map(Number);
  const endTotal = h * 60 + m + span;
  const endH = Math.min(23, Math.floor(endTotal / 60));
  const endM = endTotal % 60;
  return {
    start_time: DEFAULT_START,
    end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
  };
}

function planTitle(hw) {
  const topic = String(hw?.topic_label || '').trim();
  if (topic) return `Ödev: ${topic}`.slice(0, 300);
  const title = String(hw?.title || '').trim();
  return `Ödev: ${title || 'çalışma'}`.slice(0, 300);
}

/** Ödevin hedeflediği öğrenci kimlikleri. */
export function homeworkTargetStudentIds(hw, classStudents = []) {
  const mode = String(hw?.assignee_mode || 'class');
  if (mode === 'students') {
    const ids = Array.isArray(hw?.assignee_student_ids) ? hw.assignee_student_ids : [];
    return [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  }
  return [...new Set((classStudents || []).map((st) => String(st?.id || '').trim()).filter(Boolean))];
}

/** Ödeve bağlı plan satırlarını siler (taslağa çekildi / silindi / tarih kalktı). */
export async function removeHomeworkPlanEntries(homeworkId, { keepStudentIds = null } = {}) {
  const id = String(homeworkId || '').trim();
  if (!id) return { removed: 0 };
  try {
    const keep = new Set((keepStudentIds || []).map((x) => String(x || '').trim()).filter(Boolean));
    const { data: rows, error: readErr } = await supabaseAdmin
      .from('weekly_planner_entries')
      .select('id, student_id')
      .eq('homework_id', id);
    if (readErr) throw readErr;
    const doomed = (rows || [])
      .filter((r) => !keep.has(String(r.student_id)))
      .map((r) => r.id);
    if (!doomed.length) return { removed: 0 };
    const { error } = await supabaseAdmin.from('weekly_planner_entries').delete().in('id', doomed);
    if (error) throw error;
    return { removed: doomed.length };
  } catch (e) {
    console.warn('[homework-weekly-plan] silme:', errorMessage(e));
    return { removed: 0, error: errorMessage(e) };
  }
}

/**
 * Ödevi haftalık plana yazar / günceller.
 * @param {object} args
 * @param {object} args.hw            edu_homework satırı (yeni alanlarla)
 * @param {object} args.lessonRow     edu_lesson_rows satırı (kurum için)
 * @param {Array}  args.classStudents ders satırının öğrencileri [{id}]
 * @returns {Promise<{created:number, updated:number, skipped:string|null}>}
 */
export async function syncHomeworkToWeeklyPlan({ hw, lessonRow = null, classStudents = [] } = {}) {
  const homeworkId = String(hw?.id || '').trim();
  if (!homeworkId) return { created: 0, updated: 0, skipped: 'no_homework' };

  const published = String(hw?.status || '') === 'published';
  const dueDate = String(hw?.due_date || '').slice(0, 10);

  // Taslak veya tarihsiz ödev plana düşmez; daha önce düştüyse temizlenir
  if (!published || !dueDate) {
    await removeHomeworkPlanEntries(homeworkId);
    return { created: 0, updated: 0, skipped: published ? 'no_due_date' : 'not_published' };
  }

  const studentIds = homeworkTargetStudentIds(hw, classStudents);
  if (!studentIds.length) {
    await removeHomeworkPlanEntries(homeworkId);
    return { created: 0, updated: 0, skipped: 'no_students' };
  }

  // Hedef dışında kalan öğrencilerin eski satırları silinir
  await removeHomeworkPlanEntries(homeworkId, { keepStudentIds: studentIds });

  const institutionId =
    (hw?.institution_id && String(hw.institution_id)) ||
    (lessonRow?.institution_id && String(lessonRow.institution_id)) ||
    null;
  const subject = String(hw?.subject_name || lessonRow?.subject_name || '').trim() || 'Ödev';
  const title = planTitle(hw);
  const { start_time, end_time } = planTimes(hw?.target_minutes);
  const planned = Number(hw?.target_question_count);
  const plannedQuantity = Number.isFinite(planned) && planned > 0 ? planned : 0;
  const now = new Date().toISOString();

  let created = 0;
  let updated = 0;
  try {
    const { data: existing, error: readErr } = await supabaseAdmin
      .from('weekly_planner_entries')
      .select('id, student_id')
      .eq('homework_id', homeworkId);
    if (readErr) throw readErr;
    const byStudent = new Map((existing || []).map((r) => [String(r.student_id), r.id]));

    const inserts = [];
    for (const sid of studentIds) {
      const shared = {
        institution_id: institutionId,
        subject,
        title,
        planned_quantity: plannedQuantity,
        planner_date: dueDate,
        start_time,
        end_time,
        updated_at: now
      };
      const existingId = byStudent.get(sid);
      if (existingId) {
        // Öğrenci tamamladıysa durumunu bozma
        const { error } = await supabaseAdmin
          .from('weekly_planner_entries')
          .update(shared)
          .eq('id', existingId);
        if (error) throw error;
        updated += 1;
      } else {
        inserts.push({
          id: `wpe-hw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          student_id: sid,
          homework_id: homeworkId,
          completed_quantity: 0,
          status: 'planned',
          created_at: now,
          ...shared
        });
      }
    }

    if (inserts.length) {
      const { error } = await supabaseAdmin.from('weekly_planner_entries').insert(inserts);
      if (error) throw error;
      created = inserts.length;
    }
  } catch (e) {
    console.warn('[homework-weekly-plan] yazma:', errorMessage(e));
    return { created, updated, skipped: 'error', error: errorMessage(e) };
  }

  return { created, updated, skipped: null };
}

/** Verilen tarihin haftasının pazartesi'si (ISO, Istanbul kabulü). */
export function weekStartDate(isoDate) {
  const base = String(isoDate || '').slice(0, 10);
  const d = new Date(`${base || new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const dow = d.getUTCDay(); // 0 pazar
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function goalTitle(hw) {
  const topic = String(hw?.topic_label || '').trim();
  if (topic) return `Ödev: ${topic}`.slice(0, 200);
  const title = String(hw?.title || '').trim();
  return `Ödev: ${title || 'çalışma'}`.slice(0, 200);
}

/**
 * Ödevi haftalık planın SOL panelinde hedef kartı olarak gösterir.
 * Öğrenci kartı istediği güne/saate kendisi sürükler; sistem hücreye yerleştirmez.
 *
 * @returns {Promise<{created:number, updated:number, skipped:string|null}>}
 */
export async function syncHomeworkToCoachGoals({ hw, lessonRow = null, classStudents = [] } = {}) {
  const homeworkId = String(hw?.id || '').trim();
  if (!homeworkId) return { created: 0, updated: 0, skipped: 'no_homework' };

  const published = String(hw?.status || '') === 'published';
  if (!published) {
    await removeHomeworkCoachGoals(homeworkId);
    return { created: 0, updated: 0, skipped: 'not_published' };
  }

  const studentIds = homeworkTargetStudentIds(hw, classStudents);
  if (!studentIds.length) {
    await removeHomeworkCoachGoals(homeworkId);
    return { created: 0, updated: 0, skipped: 'no_students' };
  }
  await removeHomeworkCoachGoals(homeworkId, { keepStudentIds: studentIds });

  const institutionId =
    (hw?.institution_id && String(hw.institution_id)) ||
    (lessonRow?.institution_id && String(lessonRow.institution_id)) ||
    null;
  const subject = String(hw?.subject_name || lessonRow?.subject_name || '').trim() || 'Ödev';
  const title = goalTitle(hw);
  const givenAt = String(hw?.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const dueDate = String(hw?.due_date || '').slice(0, 10) || null;
  const target = Number(hw?.target_question_count);
  const targetQuantity = Number.isFinite(target) && target > 0 ? target : 1;
  const now = new Date().toISOString();

  let created = 0;
  let updated = 0;
  try {
    const { data: existing, error: readErr } = await supabaseAdmin
      .from('coach_weekly_goals')
      .select('id, student_id')
      .eq('homework_id', homeworkId);
    if (readErr) throw readErr;
    const byStudent = new Map((existing || []).map((r) => [String(r.student_id), r.id]));

    const inserts = [];
    for (const sid of studentIds) {
      const shared = {
        institution_id: institutionId,
        subject,
        title,
        target_quantity: targetQuantity,
        quantity_unit: 'soru',
        week_start_date: weekStartDate(givenAt),
        goal_start_date: givenAt,
        goal_end_date: dueDate,
        updated_at: now
      };
      const existingId = byStudent.get(sid);
      if (existingId) {
        const { error } = await supabaseAdmin.from('coach_weekly_goals').update(shared).eq('id', existingId);
        if (error) throw error;
        updated += 1;
      } else {
        inserts.push({
          id: `cwg-hw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          student_id: sid,
          homework_id: homeworkId,
          created_at: now,
          ...shared
        });
      }
    }
    if (inserts.length) {
      const { error } = await supabaseAdmin.from('coach_weekly_goals').insert(inserts);
      if (error) throw error;
      created = inserts.length;
    }
  } catch (e) {
    console.warn('[homework-weekly-plan] hedef kartı:', errorMessage(e));
    return { created, updated, skipped: 'error', error: errorMessage(e) };
  }

  return { created, updated, skipped: null };
}

/** Ödeve bağlı hedef kartlarını siler (taslağa çekildi / silindi / hedef dışı öğrenci). */
export async function removeHomeworkCoachGoals(homeworkId, { keepStudentIds = null } = {}) {
  const id = String(homeworkId || '').trim();
  if (!id) return { removed: 0 };
  try {
    const keep = new Set((keepStudentIds || []).map((x) => String(x || '').trim()).filter(Boolean));
    const { data: rows, error: readErr } = await supabaseAdmin
      .from('coach_weekly_goals')
      .select('id, student_id')
      .eq('homework_id', id);
    if (readErr) throw readErr;
    const doomed = (rows || []).filter((r) => !keep.has(String(r.student_id))).map((r) => r.id);
    if (!doomed.length) return { removed: 0 };
    const { error } = await supabaseAdmin.from('coach_weekly_goals').delete().in('id', doomed);
    if (error) throw error;
    return { removed: doomed.length };
  } catch (e) {
    console.warn('[homework-weekly-plan] hedef kartı silme:', errorMessage(e));
    return { removed: 0, error: errorMessage(e) };
  }
}

/** Öğrenci ödevi tamamlayınca plan satırı da tamamlandıya döner. */
export async function markHomeworkPlanCompleted({ homeworkId, studentId, solvedQuestionCount = null }) {
  const hwId = String(homeworkId || '').trim();
  const sid = String(studentId || '').trim();
  if (!hwId || !sid) return { updated: 0 };
  try {
    const patch = { status: 'completed', updated_at: new Date().toISOString() };
    const solved = Number(solvedQuestionCount);
    if (Number.isFinite(solved) && solved > 0) patch.completed_quantity = solved;

    const { error } = await supabaseAdmin
      .from('weekly_planner_entries')
      .update(patch)
      .eq('homework_id', hwId)
      .eq('student_id', sid);
    if (error) throw error;

    /**
     * Öğrenci ödevi sol panelden kendisi yerleştirdiyse satır homework_id değil
     * coach_goal_id taşır; o satırlar da tamamlandıya çekilir.
     */
    const { data: goals } = await supabaseAdmin
      .from('coach_weekly_goals')
      .select('id')
      .eq('homework_id', hwId)
      .eq('student_id', sid);
    const goalIds = (goals || []).map((g) => g.id).filter(Boolean);
    if (goalIds.length) {
      await supabaseAdmin
        .from('weekly_planner_entries')
        .update(patch)
        .eq('student_id', sid)
        .in('coach_goal_id', goalIds);
    }
    return { updated: 1 };
  } catch (e) {
    console.warn('[homework-weekly-plan] tamamlama:', errorMessage(e));
    return { updated: 0, error: errorMessage(e) };
  }
}
