import { supabaseAdmin } from './supabase-admin.js';

/** students.coach_id üzerinden coach kaydındaki student_ids listesini yeniler. */
export async function rebuildCoachStudentIdsFromFk(coachId) {
  if (!coachId) return;
  const { data: rows, error } = await supabaseAdmin.from('students').select('id').eq('coach_id', coachId);
  if (error) throw error;
  const ids = (rows || []).map((r) => r.id);
  await supabaseAdmin
    .from('coaches')
    .update({ student_ids: ids, updated_at: new Date().toISOString() })
    .eq('id', coachId);
}

/** coaches.student_ids ile students.coach_id alanını tutarlı hale getirir (tek kaynak: liste). */
export async function applyStudentIdsToCoachFk(coachId, desiredStudentIds) {
  if (!coachId) return;
  const desired = new Set((desiredStudentIds || []).map(String).filter(Boolean));

  const { data: wasMine, error: e1 } = await supabaseAdmin.from('students').select('id').eq('coach_id', coachId);
  if (e1) throw e1;

  const nowIso = () => new Date().toISOString();

  for (const r of wasMine || []) {
    if (!desired.has(String(r.id))) {
      const { error } = await supabaseAdmin
        .from('students')
        .update({ coach_id: null, updated_at: nowIso() })
        .eq('id', r.id);
      if (error) throw error;
    }
  }

  for (const sid of desired) {
    const { error } = await supabaseAdmin
      .from('students')
      .update({ coach_id: coachId, updated_at: nowIso() })
      .eq('id', sid);
    if (error) throw error;
  }

  await supabaseAdmin
    .from('coaches')
    .update({ student_ids: Array.from(desired), updated_at: nowIso() })
    .eq('id', coachId);
}
