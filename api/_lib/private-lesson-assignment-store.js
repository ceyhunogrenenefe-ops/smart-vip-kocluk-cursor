import { supabaseAdmin } from './supabase-admin.js';

function isMissingTableError(err) {
  const msg = String(err?.message || err || '');
  return /teacher_private_lesson_assignments|does not exist|schema cache|could not find the table|PGRST205|relation .* does not exist/i.test(
    msg
  );
}

function isMissingQuotaTableError(err) {
  const msg = String(err?.message || err || '');
  return /student_teacher_lesson_quota|does not exist|schema cache|could not find the table|PGRST205|relation .* does not exist/i.test(
    msg
  );
}

/**
 * Kota satırı yoksa oluşturur (credits_total null = sınırsız).
 * Varsa dokunmaz (ödeme / paket alanlarını ezmez).
 */
export async function ensureQuotaRowForPair({
  studentId,
  teacherId,
  institutionId = null
}) {
  const sid = String(studentId || '').trim();
  const tid = String(teacherId || '').trim();
  if (!sid || !tid) return { ok: false, skipped: true };

  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('id, student_id, teacher_id')
      .eq('teacher_id', tid)
      .eq('student_id', sid)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing?.id) return { ok: true, data: existing, created: false };

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('student_teacher_lesson_quota')
      .insert({
        institution_id: institutionId || null,
        student_id: sid,
        teacher_id: tid,
        credits_total: null,
        updated_at: now
      })
      .select('*')
      .single();
    if (error) {
      // Unique race — tekrar oku
      if (/duplicate|unique/i.test(String(error.message || ''))) {
        const { data: again } = await supabaseAdmin
          .from('student_teacher_lesson_quota')
          .select('*')
          .eq('teacher_id', tid)
          .eq('student_id', sid)
          .maybeSingle();
        return { ok: true, data: again, created: false };
      }
      throw error;
    }
    return { ok: true, data, created: true };
  } catch (e) {
    if (isMissingQuotaTableError(e)) return { ok: false, tableMissing: true };
    throw e;
  }
}

/**
 * Öğretmen–öğrenci özel ders ataması (idempotent upsert).
 * Aynı anda kota satırını da garanti eder (çift yönlü senkron).
 */
export async function upsertPrivateLessonAssignmentRow({
  studentId,
  teacherId,
  institutionId = null,
  assignedBy = null,
  ensureQuota = true
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

  let assignmentResult;
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
      assignmentResult = { ok: true, data, created: false };
    } else {
      const { data, error } = await supabaseAdmin
        .from('teacher_private_lesson_assignments')
        .insert({ ...payload, created_at: now })
        .select('*')
        .single();
      if (error) throw error;
      assignmentResult = { ok: true, data, created: true };
    }
  } catch (e) {
    if (isMissingTableError(e)) return { ok: false, tableMissing: true };
    throw e;
  }

  if (ensureQuota) {
    try {
      const q = await ensureQuotaRowForPair({
        studentId: sid,
        teacherId: tid,
        institutionId: institutionId || assignmentResult.data?.institution_id || null
      });
      assignmentResult.quota = q;
    } catch (qe) {
      console.warn(
        '[private-lesson-assignment-store] ensureQuota failed',
        qe?.message || qe
      );
      assignmentResult.quotaError = String(qe?.message || qe);
    }
  }

  return assignmentResult;
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

/**
 * Kurum (veya tüm) kayıtlar için çift yönlü senkron:
 * - kota → aktif atama
 * - aktif atama → kota (yoksa sınırsız)
 */
export async function syncAllPrivateLessonLinks({ institutionId = null, limit = 2000 } = {}) {
  const stats = {
    quota_to_assignment: 0,
    assignment_to_quota: 0,
    errors: []
  };

  // 1) Kota → atama
  try {
    let q = supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('student_id, teacher_id, institution_id')
      .limit(limit);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data: quotas, error } = await q;
    if (error) {
      if (!isMissingQuotaTableError(error)) throw error;
    } else {
      for (const row of quotas || []) {
        const sid = String(row.student_id || '').trim();
        const tid = String(row.teacher_id || '').trim();
        if (!sid || !tid) continue;
        try {
          const r = await upsertPrivateLessonAssignmentRow({
            studentId: sid,
            teacherId: tid,
            institutionId: row.institution_id || institutionId || null,
            ensureQuota: false
          });
          if (r.ok && (r.created || r.data)) stats.quota_to_assignment += 1;
        } catch (e) {
          stats.errors.push({
            dir: 'quota_to_assignment',
            student_id: sid,
            teacher_id: tid,
            error: String(e?.message || e)
          });
        }
      }
    }
  } catch (e) {
    if (!isMissingQuotaTableError(e)) {
      stats.errors.push({ dir: 'quota_scan', error: String(e?.message || e) });
    }
  }

  // 2) Aktif atama → kota
  try {
    let aq = supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .select('student_id, teacher_id, institution_id, active')
      .limit(limit);
    if (institutionId) aq = aq.eq('institution_id', institutionId);
    const { data: assigns, error } = await aq;
    if (error) {
      if (!isMissingTableError(error)) throw error;
      return { ok: false, tableMissing: true, ...stats };
    }
    for (const row of assigns || []) {
      if (row.active === false) continue;
      const sid = String(row.student_id || '').trim();
      const tid = String(row.teacher_id || '').trim();
      if (!sid || !tid) continue;
      try {
        const r = await ensureQuotaRowForPair({
          studentId: sid,
          teacherId: tid,
          institutionId: row.institution_id || institutionId || null
        });
        if (r.ok && r.created) stats.assignment_to_quota += 1;
        else if (r.ok) stats.assignment_to_quota += 0;
      } catch (e) {
        stats.errors.push({
          dir: 'assignment_to_quota',
          student_id: sid,
          teacher_id: tid,
          error: String(e?.message || e)
        });
      }
    }
  } catch (e) {
    if (isMissingTableError(e)) return { ok: false, tableMissing: true, ...stats };
    stats.errors.push({ dir: 'assignment_scan', error: String(e?.message || e) });
  }

  return { ok: true, ...stats };
}
