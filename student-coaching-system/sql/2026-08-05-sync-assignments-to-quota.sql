-- Aktif özel ders atamalarını kota (enrollment) tablosuna yansıtır.
-- Eksik kota satırı: credits_total NULL = sınırsız paket.
-- Önce: 2026-07-10-teacher-private-lesson-assignments.sql
--        2026-05-09-student-teacher-lesson-quota.sql
-- Kardeş script: 2026-07-10-sync-quota-to-private-assignments.sql (ters yön)
-- Supabase SQL Editor'da bir kez çalıştırın.

INSERT INTO public.student_teacher_lesson_quota (
  institution_id,
  student_id,
  teacher_id,
  credits_total,
  updated_at
)
SELECT
  a.institution_id,
  a.student_id,
  a.teacher_id,
  NULL,
  COALESCE(a.updated_at, now())
FROM public.teacher_private_lesson_assignments a
WHERE a.teacher_id IS NOT NULL
  AND a.student_id IS NOT NULL
  AND COALESCE(a.active, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_teacher_lesson_quota q
    WHERE q.teacher_id = a.teacher_id
      AND q.student_id = a.student_id
  );
