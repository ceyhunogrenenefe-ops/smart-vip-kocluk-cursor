-- Öğretmen completed_lessons_count: özel ders + grup canlı ders
-- Supabase SQL Editor'da bir kez çalıştırın.

WITH priv AS (
  SELECT teacher_id, count(*)::int AS cnt
  FROM public.teacher_lessons
  WHERE status = 'completed'
  GROUP BY teacher_id
),
grp AS (
  SELECT teacher_id, count(*)::int AS cnt
  FROM public.class_sessions
  WHERE status = 'completed'
  GROUP BY teacher_id
),
totals AS (
  SELECT
    COALESCE(priv.teacher_id, grp.teacher_id) AS teacher_id,
    COALESCE(priv.cnt, 0) + COALESCE(grp.cnt, 0) AS cnt
  FROM priv
  FULL OUTER JOIN grp ON priv.teacher_id = grp.teacher_id
)
UPDATE public.teacher_profiles tp
SET
  completed_lessons_count = totals.cnt,
  updated_at = now()
FROM totals
WHERE tp.user_id = totals.teacher_id;

NOTIFY pgrst, 'reload schema';
