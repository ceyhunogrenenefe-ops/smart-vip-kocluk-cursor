-- Yoklama WA idempotency — duplicate temizle + unique index
-- RUN IN SUPABASE SQL EDITOR (production)
-- Aynı related_id+student_id+kind için fazla "sent" satırlarını tekilleştirir, sonra index kurar.

-- 1) Absent bildirimleri
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY related_id, student_id, kind
      ORDER BY sent_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM message_logs
  WHERE status = 'sent'
    AND kind IN ('class_absent_notice_1', 'class_absent_notice')
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL
)
UPDATE message_logs m
SET
  status = 'skipped',
  error = COALESCE(NULLIF(TRIM(m.error), ''), 'dedupe_for_uq_message_logs_absent_sent')
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 2) Late update
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY related_id, student_id, kind
      ORDER BY sent_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM message_logs
  WHERE status = 'sent'
    AND kind = 'class_attendance_late_update'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL
)
UPDATE message_logs m
SET
  status = 'skipped',
  error = COALESCE(NULLIF(TRIM(m.error), ''), 'dedupe_for_uq_message_logs_late_update_sent')
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 3) Koç toplu özet
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY related_id, kind
      ORDER BY sent_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM message_logs
  WHERE status = 'sent'
    AND kind = 'class_attendance_coach_summary'
    AND related_id IS NOT NULL
)
UPDATE message_logs m
SET
  status = 'skipped',
  error = COALESCE(NULLIF(TRIM(m.error), ''), 'dedupe_for_uq_message_logs_coach_summary_sent')
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 4) Koç late delta
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY related_id, student_id, kind
      ORDER BY sent_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM message_logs
  WHERE status = 'sent'
    AND kind = 'class_attendance_coach_late_delta'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL
)
UPDATE message_logs m
SET
  status = 'skipped',
  error = COALESCE(NULLIF(TRIM(m.error), ''), 'dedupe_for_uq_message_logs_coach_late_delta_sent')
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 5) Unique index'ler
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_absent_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind IN ('class_absent_notice_1', 'class_absent_notice')
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_late_update_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_attendance_late_update'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_coach_summary_sent
  ON message_logs (related_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_attendance_coach_summary'
    AND related_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_coach_late_delta_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_attendance_coach_late_delta'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

COMMENT ON INDEX uq_message_logs_absent_sent IS
  'Duplicate WhatsApp koruması: aynı ders+öğrenci absent bildirimi bir kez sent';

NOTIFY pgrst, 'reload schema';
