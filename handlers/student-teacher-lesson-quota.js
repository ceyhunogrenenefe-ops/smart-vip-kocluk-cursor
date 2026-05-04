import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { sumLessonUnitsUsed } from '../api/_lib/count-teacher-lesson-usage.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

function assertCanAccessStudent(actor, student) {
  if (!student) return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, student.institution_id);
  if (actor.role === 'teacher') return hasInstitutionAccess(actor, student.institution_id);
  if (actor.role === 'coach') return Boolean(actor.coach_id && student.coach_id === actor.coach_id);
  return false;
}

/** GET: ?student_id= & optional teacher_id | liste */
export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);

    if (req.method === 'GET') {
      const studentId = typeof req.query?.student_id === 'string' ? req.query.student_id.trim() : '';
      const oneTeacher = typeof req.query?.teacher_id === 'string' ? req.query.teacher_id.trim() : '';

      if (actor.role === 'student') {
        if (!actor.student_id) return jsonError(res, 403, 'student_profile_missing');
        if (studentId && studentId !== actor.student_id) return jsonError(res, 403, 'forbidden');
      }

      if (studentId) {
        const { data: student, error: se } = await supabaseAdmin
          .from('students')
          .select('*')
          .eq('id', studentId)
          .maybeSingle();
        if (se) throw se;
        if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');
        if (actor.role === 'student' && actor.student_id === studentId) {
          /* ok */
        } else if (!assertCanAccessStudent(actor, student)) {
          return jsonError(res, 403, 'forbidden');
        }

        let q = supabaseAdmin
          .from('student_teacher_lesson_quota')
          .select('*')
          .eq('student_id', studentId);
        if (oneTeacher) q = q.eq('teacher_id', oneTeacher);
        const { data: rows, error: qe } = await q;
        if (qe) {
          const msg = errorMessage(qe);
          if (/does not exist|schema cache/i.test(msg)) {
            return res.status(200).json({ data: [], hint: 'student_teacher_lesson_quota_sql_missing' });
          }
          throw qe;
        }

        const enriched = [];
        for (const r of rows || []) {
          const usedUnits = await sumLessonUnitsUsed(r.student_id, r.teacher_id);
          const total = r.credits_total;
          const unlimited = total == null;
          const remaining = unlimited ? null : Math.max(0, total - usedUnits);
          const exhausted = !unlimited && usedUnits >= total;
          enriched.push({
            ...r,
            units_used: usedUnits,
            lessons_used: usedUnits,
            remaining,
            unlimited,
            exhausted
          });
        }
        return res.status(200).json({ data: enriched });
      }

      if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
        return jsonError(res, 400, 'student_id gerekli');
      }

      let q = supabaseAdmin.from('student_teacher_lesson_quota').select('*').order('updated_at', { ascending: false });
      if (actor.role === 'admin') {
        if (!actor.institution_id) return res.status(200).json({ data: [] });
        q = q.eq('institution_id', actor.institution_id);
      }
      const { data: rows, error: le } = await q;
      if (le) {
        const msg = errorMessage(le);
        if (/does not exist|schema cache/i.test(msg)) {
          return res.status(200).json({ data: [], hint: 'student_teacher_lesson_quota_sql_missing' });
        }
        throw le;
      }
      const enriched = [];
      for (const r of rows || []) {
        const usedUnits = await sumLessonUnitsUsed(r.student_id, r.teacher_id);
        const total = r.credits_total;
        const unlimited = total == null;
        const remaining = unlimited ? null : Math.max(0, (total ?? 0) - usedUnits);
        enriched.push({
          ...r,
          units_used: usedUnits,
          lessons_used: usedUnits,
          remaining,
          unlimited,
          exhausted: !unlimited && usedUnits >= (total ?? 0)
        });
      }
      return res.status(200).json({ data: enriched });
    }

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      if (!['super_admin', 'admin', 'teacher', 'coach'].includes(actor.role)) {
        return jsonError(res, 403, 'forbidden');
      }

      const body = req.body || {};
      const studentId = String(body.student_id || '').trim();
      const teacherId = String(body.teacher_id || '').trim();
      let creditsTotal = body.credits_total;
      if (creditsTotal === '' || creditsTotal === undefined) creditsTotal = null;
      if (creditsTotal !== null && creditsTotal !== undefined) {
        creditsTotal = Number(creditsTotal);
        if (Number.isNaN(creditsTotal) || creditsTotal < 0) {
          return jsonError(res, 400, 'credits_total geçerli bir sayı veya boş (sınırsız) olmalıdır.');
        }
      }

      if (!studentId || !teacherId) {
        return jsonError(res, 400, 'student_id ve teacher_id zorunludur.');
      }

      const { data: student, error: sErr } = await supabaseAdmin
        .from('students')
        .select('*')
        .eq('id', studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');
      if (!assertCanAccessStudent(actor, student)) return jsonError(res, 403, 'forbidden');

      const { data: teacherUser, error: tErr } = await supabaseAdmin
        .from('users')
        .select('id, role, institution_id')
        .eq('id', teacherId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!teacherUser) return jsonError(res, 404, 'Öğretmen kullanıcısı bulunamadı.');
      if (!['teacher', 'coach', 'admin'].includes(String(teacherUser.role))) {
        return jsonError(res, 400, 'teacher_id bir öğretmen/koç/yönetici kullanıcısı olmalıdır.');
      }

      if (actor.role === 'admin' && !hasInstitutionAccess(actor, student.institution_id)) {
        return jsonError(res, 403, 'forbidden');
      }

      const institutionId = student.institution_id || actor.institution_id || null;

      const payload = {
        student_id: studentId,
        teacher_id: teacherId,
        institution_id: institutionId,
        credits_total: creditsTotal,
        updated_at: new Date().toISOString()
      };

      const { data: saved, error: upErr } = await supabaseAdmin
        .from('student_teacher_lesson_quota')
        .upsert(payload, { onConflict: 'student_id,teacher_id' })
        .select('*')
        .single();

      if (upErr) {
        const msg = errorMessage(upErr);
        if (/does not exist|schema cache/i.test(msg)) {
          return res.status(503).json({
            error:
              '`student_teacher_lesson_quota` tablosu yok. Supabase’te `2026-05-09-student-teacher-lesson-quota.sql` dosyasını çalıştırın.',
            code: 'quota_table_missing'
          });
        }
        throw upErr;
      }

      const usedUnits = await sumLessonUnitsUsed(studentId, teacherId);
      const total = saved.credits_total;
      const unlimited = total == null;
      const remaining = unlimited ? null : Math.max(0, (total ?? 0) - usedUnits);

      return res.status(200).json({
        data: {
          ...saved,
          units_used: usedUnits,
          lessons_used: usedUnits,
          remaining,
          unlimited,
          exhausted: !unlimited && usedUnits >= (total ?? 0)
        }
      });
    }

    if (req.method === 'DELETE') {
      if (!['super_admin', 'admin', 'teacher', 'coach'].includes(actor.role)) {
        return jsonError(res, 403, 'forbidden');
      }
      const studentId = String(req.query?.student_id || '').trim();
      const teacherId = String(req.query?.teacher_id || '').trim();
      if (!studentId || !teacherId) return jsonError(res, 400, 'student_id ve teacher_id gerekli');

      const { data: student } = await supabaseAdmin.from('students').select('*').eq('id', studentId).maybeSingle();
      if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');
      if (!assertCanAccessStudent(actor, student)) return jsonError(res, 403, 'forbidden');

      const { error: delErr } = await supabaseAdmin
        .from('student_teacher_lesson_quota')
        .delete()
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId);
      if (delErr) throw delErr;
      return res.status(200).json({ ok: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (e) {
    const msg = errorMessage(e);
    if (['Missing token', 'Invalid token', 'Invalid signature', 'Token expired'].includes(String(msg))) {
      return res.status(401).json({ error: msg });
    }
    console.error('[student-teacher-lesson-quota]', msg, e);
    return res.status(500).json({ error: msg });
  }
}
