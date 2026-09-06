/**
 * Öğrenci öğretmen değerlendirmesi
 * GET  /api/reviews/student  → { lesson_ids, class_session_ids }
 * POST /api/reviews/student
 * Body: { lesson_id?, class_session_id?, rating, comment?, reviewer_name? }
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

async function resolveStudentId(actor) {
  let studentId = actor.student_id ? String(actor.student_id).trim() : '';
  if (!studentId && actor.sub) {
    const stud = await resolveStudentRowForUser({ userId: actor.sub });
    studentId = stud?.id ? String(stud.id) : '';
  }
  return studentId;
}

async function assertStudentInClass(studentId, classId) {
  const { data, error } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.student_id);
}

async function assertNotMarkedAbsent(studentId, sessionId) {
  const { data, error } = await supabaseAdmin
    .from('class_session_attendance')
    .select('status')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return true;
  const st = String(data.status || '').toLowerCase();
  return st !== 'absent' && st !== 'excused_absent';
}

export default async function handler(req, res) {
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

  if (req.method === 'GET') {
    try {
      const studentId = await resolveStudentId(actor);
      if (!studentId) return res.status(403).json({ error: 'student_profile_missing' });

      const { data, error } = await supabaseAdmin
        .from('teacher_reviews')
        .select('lesson_id, class_session_id')
        .eq('student_id', studentId)
        .eq('reviewer_type', 'STUDENT');
      if (error) throw error;

      const lessonIds = [];
      const classSessionIds = [];
      for (const row of data || []) {
        if (row.lesson_id) lessonIds.push(String(row.lesson_id));
        if (row.class_session_id) classSessionIds.push(String(row.class_session_id));
      }
      return res.status(200).json({
        lesson_ids: lessonIds,
        class_session_ids: classSessionIds
      });
    } catch (e) {
      console.error('[reviews/student GET]', errorMessage(e));
      return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const lessonId = String(body.lesson_id || body.lessonId || '').trim();
  const classSessionId = String(
    body.class_session_id || body.classSessionId || body.session_id || body.sessionId || ''
  ).trim();
  const rating = clampRating(body.rating);
  const comment = snippetComment(body.comment ?? body.review);

  if (!lessonId && !classSessionId) {
    return res.status(400).json({ error: 'lesson_or_session_required' });
  }
  if (!rating) {
    return res.status(400).json({ error: 'rating_invalid', hint: 'Puan 1-5 arası olmalı.' });
  }

  try {
    const studentId = await resolveStudentId(actor);
    if (!studentId) return res.status(403).json({ error: 'student_profile_missing' });

    let teacherId = '';
    let insertLessonId = null;
    let insertClassSessionId = null;

    if (classSessionId) {
      const { data: session, error: sessionErr } = await supabaseAdmin
        .from('class_sessions')
        .select('id, teacher_id, class_id, status, subject')
        .eq('id', classSessionId)
        .maybeSingle();
      if (sessionErr) throw sessionErr;
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      if (!session.teacher_id) {
        return res.status(400).json({
          error: 'session_no_teacher',
          hint: 'Bu oturumda öğretmen yok; değerlendirilemez.'
        });
      }
      if (String(session.status) !== 'completed') {
        return res.status(400).json({
          error: 'session_not_completed',
          hint: 'Yalnızca tamamlanan grup dersleri değerlendirilebilir.'
        });
      }
      if (role !== 'super_admin') {
        const inClass = await assertStudentInClass(studentId, session.class_id);
        if (!inClass) return res.status(403).json({ error: 'session_not_yours' });
        const okAttend = await assertNotMarkedAbsent(studentId, session.id);
        if (!okAttend) {
          return res.status(403).json({
            error: 'not_attended',
            hint: 'Yoklamada yok görünen oturum değerlendirilemez.'
          });
        }
      }

      const { data: existing } = await supabaseAdmin
        .from('teacher_reviews')
        .select('id')
        .eq('class_session_id', classSessionId)
        .eq('student_id', studentId)
        .eq('reviewer_type', 'STUDENT')
        .maybeSingle();
      if (existing?.id) {
        return res.status(409).json({
          error: 'already_reviewed',
          hint: 'Bu grup dersi için zaten değerlendirme yaptınız.'
        });
      }

      teacherId = String(session.teacher_id);
      insertClassSessionId = classSessionId;
    } else {
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

      teacherId = String(lesson.teacher_id);
      insertLessonId = lessonId;
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
      teacher_id: teacherId,
      student_id: studentId,
      lesson_id: insertLessonId,
      class_session_id: insertClassSessionId,
      reviewer_type: 'STUDENT',
      reviewer_name: reviewerName.slice(0, 120),
      rating,
      comment,
      is_public: false,
      moderation_status: 'pending'
    };

    const { data: saved, error: insErr } = await supabaseAdmin
      .from('teacher_reviews')
      .insert(insertRow)
      .select('*')
      .maybeSingle();
    if (insErr) {
      if (/class_session_id|schema cache/i.test(insErr.message || '')) {
        return res.status(503).json({
          error: 'migration_required',
          hint: 'Supabase SQL: student-coaching-system/sql/2026-09-06-teacher-reviews-class-sessions.sql'
        });
      }
      if (/teacher_reviews|does not exist|schema cache/i.test(insErr.message || '')) {
        return res.status(503).json({
          error: 'table_missing',
          hint: 'Supabase SQL: student-coaching-system/sql/2026-09-05-teacher-reviews.sql'
        });
      }
      throw insErr;
    }

    const stats = await refreshTeacherReviewStats(teacherId);
    return res.status(201).json({
      data: mapReviewToApi(saved),
      stats,
      moderation: 'pending',
      hint: 'Yorumunuz admin onayından sonra sitede yayınlanır.'
    });
  } catch (e) {
    console.error('[reviews/student]', errorMessage(e));
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
