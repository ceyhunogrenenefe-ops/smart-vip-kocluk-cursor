import { supabaseAdmin } from './supabase-admin.js';

function isMissingTableError(err) {
  const msg = String(err?.message || err || '');
  return /teacher_private_lesson_assignments|does not exist|schema cache|could not find the table|PGRST205|relation .* does not exist/i.test(
    msg
  );
}

/** Öğretmen–öğrenci özel ders ataması (idempotent upsert). Tablo yoksa sessizce atlanır. */
export async function upsertPrivateLessonAssignmentRow({
  studentId,
  teacherId,
  institutionId = null,
  assignedBy = null
}) {
  const sid = String(studentId || '').trim();
  const tid = String(teacherId || '').trim();
  if (!sid || !tid) return { ok: false, skipped: true };

  const now = new Date().toISOString();
  const payload = {
    institution_id: institutionId || null,
    teacher_id: tid,
    student_id: sid,
    active: true,
    assigned_by: assignedBy && assignedBy !== 'anonymous' ? assignedBy : null,
    updated_at: now
  };

  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .select('id')
      .eq('teacher_id', tid)
      .eq('student_id', sid)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('teacher_private_lesson_assignments')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return { ok: true, data, created: false };
    }

    const { data, error } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .insert({ ...payload, created_at: now })
      .select('*')
      .single();
    if (error) throw error;
    return { ok: true, data, created: true };
  } catch (e) {
    if (isMissingTableError(e)) return { ok: false, tableMissing: true };
    throw e;
  }
}

/** Kota kaldırıldığında eşleşen özel ders atamasını pasifleştirir. */
export async function deactivatePrivateLessonAssignmentRow({ studentId, teacherId }) {
  const sid = String(studentId || '').trim();
  const tid = String(teacherId || '').trim();
  if (!sid || !tid) return { ok: false, skipped: true };

  try {
    const { error } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('teacher_id', tid)
      .eq('student_id', sid);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    if (isMissingTableError(e)) return { ok: false, tableMissing: true };
    throw e;
  }
}
