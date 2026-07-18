-- Mevcut student_teacher_lesson_quota kayıtlarını özel ders atamasına yansıtır.
-- Öğretmen paneli "Öğrencilerim" listesi teacher_private_lesson_assignments tablosunu da okur.
-- Supabase SQL Editor'da bir kez çalıştırın (2026-07-10-teacher-private-lesson-assignments.sql sonrası).

INSERT INTO public.teacher_private_lesson_assignments (
  institution_id,
  teacher_id,
  student_id,
  active,
  created_at,
  updated_at
)
SELECT
  q.institution_id,
  q.teacher_id,
  q.student_id,
  true,
  COALESCE(q.created_at, q.updated_at, now()),
  COALESCE(q.updated_at, now())
FROM public.student_teacher_lesson_quota q
WHERE q.teacher_id IS NOT NULL
  AND q.student_id IS NOT NULL
ON CONFLICT (teacher_id, student_id) DO UPDATE SET
  active = true,
  institution_id = EXCLUDED.institution_id,
  updated_at = now();
