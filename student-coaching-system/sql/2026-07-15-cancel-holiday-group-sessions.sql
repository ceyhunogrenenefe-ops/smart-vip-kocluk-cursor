-- 15 Temmuz 2026 resmi tatil: 8-A, 8-B, 8-E, 8-F hariç grup ders oturumlarını iptal et
-- Maaş özeti yalnızca status='completed' sayar; cancelled hesaba girmez.
-- Haftalık şablon (class_weekly_slots) dokunulmaz; iptal satırlar yeniden oluşmayı engeller.

-- 1) Önizleme
WITH keep_classes AS (
  SELECT id, name, branch, class_level
  FROM classes
  WHERE
    upper(replace(replace(coalesce(name, ''), ' ', ''), '.', '-')) ~* '(^|[^0-9])8-?[ABEF]([^A-Z0-9]|$)'
    OR (
      regexp_replace(coalesce(class_level, ''), '\D', '', 'g') = '8'
      AND upper(trim(coalesce(branch, ''))) IN ('A', 'B', 'E', 'F')
    )
)
SELECT
  c.name AS class_name,
  s.lesson_date,
  s.start_time,
  s.subject,
  s.status,
  CASE WHEN kc.id IS NOT NULL THEN 'KEEP' ELSE 'CANCEL' END AS action
FROM class_sessions s
JOIN classes c ON c.id = s.class_id
LEFT JOIN keep_classes kc ON kc.id = s.class_id
WHERE s.lesson_date = '2026-07-15'
ORDER BY action, c.name, s.start_time;

-- 2) İptal (önizlemeyi kontrol ettikten sonra çalıştırın)
/*
WITH keep_classes AS (
  SELECT id
  FROM classes
  WHERE
    upper(replace(replace(coalesce(name, ''), ' ', ''), '.', '-')) ~* '(^|[^0-9])8-?[ABEF]([^A-Z0-9]|$)'
    OR (
      regexp_replace(coalesce(class_level, ''), '\D', '', 'g') = '8'
      AND upper(trim(coalesce(branch, ''))) IN ('A', 'B', 'E', 'F')
    )
)
UPDATE class_sessions s
SET status = 'cancelled', updated_at = now()
WHERE s.lesson_date = '2026-07-15'
  AND s.status IS DISTINCT FROM 'cancelled'
  AND s.class_id NOT IN (SELECT id FROM keep_classes);
*/
