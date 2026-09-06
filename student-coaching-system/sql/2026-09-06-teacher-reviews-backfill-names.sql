-- Mevcut "Öğrenci" reviewer_name kayıtlarını students.name ile güncelle (Ad S. formatı)
-- Supabase SQL Editor'da bir kez çalıştırın.

UPDATE public.teacher_reviews r
SET reviewer_name = CASE
  WHEN position(' ' in trim(s.name)) > 0 THEN
    trim(both from left(trim(s.name), length(trim(s.name)) - length(split_part(reverse(trim(s.name)), ' ', 1)) - 1))
    || ' '
    || upper(left(split_part(reverse(trim(s.name)), ' ', 1), 1))
    || '.'
  ELSE trim(s.name)
END
FROM public.students s
WHERE r.student_id = s.id
  AND r.reviewer_type = 'STUDENT'
  AND coalesce(trim(r.reviewer_name), '') ~* '^(öğrenci|ogrenci)$'
  AND coalesce(trim(s.name), '') <> '';

NOTIFY pgrst, 'reload schema';
