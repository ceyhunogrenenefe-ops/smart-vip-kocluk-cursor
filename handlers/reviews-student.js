/**
 * POST /api/reviews/student
 * Body: { lesson_id, rating, comment?, reviewer_name?, is_public? }
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import {
  clampRating,
  mapReviewToApi,
  refreshTeacherReviewStats,
  snippetComment
} from '../api/_lib/teacher-reviews.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const role = String(actor.role || '').toLowerCase();
  if (role !== 'student' && role !== 'super_admin') {
    return res.status(403).json({
      error: 'forbidden',
      hint: 'Sadece öğrenci değerlendirme ekleyebilir.'
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const lessonId = String(body.lesson_id || body.lessonId || '').trim();
  const rating = clampRating(body.rating);
  const comment = snippetComment(body.comment ?? body.review);
  const isPublic = body.is_public === false || body.isPublic === false ? false : true;

  if (!lessonId) return res.status(400).json({ error: 'lesson_id_required' });
  if (!rating) {
    return res.status(400).json({ error: 'rating_invalid', hint: 'Puan 1-5 arası olmalı.' });
  }

  try {
    let studentId = actor.student_id ? String(actor.student_id).trim() : '';
    if (!studentId && actor.sub) {
      const stud = await resolveStudentRowForUser({ userId: actor.sub });
      studentId = stud?.id ? String(stud.id) : '';
    }
    if (!studentId) return res.status(403).json({ error: 'student_profile_missing' });

    const { data: lesson, error: lessonErr } = await supabaseAdmin
      .from('teacher_lessons')
      .select('id, teacher_id, student_id, status, title')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonErr) throw lessonErr;
    if (!lesson) return res.status(404).json({ error: 'lesson_not_found' });
    if (String(lesson.student_id) !== studentId && role !== 'super_admin') {
      return res.status(403).json({ error: 'lesson_not_yours' });
    }
    if (String(lesson.status) !== 'completed') {
      return res.status(400).json({
        error: 'lesson_not_completed',
        hint: 'Yalnızca tamamlanan dersler değerlendirilebilir.'
      });
    }

    const { data: existing } = await supabaseAdmin
      .from('teacher_reviews')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('reviewer_type', 'STUDENT')
      .maybeSingle();
    if (existing?.id) {
      return res.status(409).json({
        error: 'already_reviewed',
        hint: 'Bu ders için zaten değerlendirme yaptınız.'
      });
    }

    let reviewerName = String(body.reviewer_name || body.reviewerName || '').trim();
    if (!reviewerName) {
      const { data: stud } = await supabaseAdmin
        .from('students')
        .select('full_name, name, first_name, last_name')
        .eq('id', studentId)
        .maybeSingle();
      reviewerName =
        String(stud?.full_name || stud?.name || '').trim() ||
        [stud?.first_name, stud?.last_name].filter(Boolean).join(' ').trim() ||
        'Öğrenci';
    }

    const insertRow = {
      teacher_id: String(lesson.teacher_id),
      student_id: studentId,
      lesson_id: lessonId,
      reviewer_type: 'STUDENT',
      reviewer_name: reviewerName.slice(0, 120),
      rating,
      comment,
      is_public: isPublic
    };

    const { data: saved, error: insErr } = await supabaseAdmin
      .from('teacher_reviews')
      .insert(insertRow)
      .select('*')
      .maybeSingle();
    if (insErr) {
      if (/teacher_reviews|does not exist|schema cache/i.test(insErr.message || '')) {
        return res.status(503).json({
          error: 'table_missing',
          hint: 'Supabase SQL: student-coaching-system/sql/2026-09-05-teacher-reviews.sql'
        });
      }
      throw insErr;
    }

    const stats = await refreshTeacherReviewStats(lesson.teacher_id);
    return res.status(201).json({ data: mapReviewToApi(saved), stats });
  } catch (e) {
    console.error('[reviews/student]', errorMessage(e));
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
