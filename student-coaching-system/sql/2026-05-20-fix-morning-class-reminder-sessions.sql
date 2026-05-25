-- Sabah hatırlatması gitmeyen oturumları düzelt (end_time boş → gece yarısı completed sayılmış olabilir)
-- Supabase SQL Editor'da bir kez çalıştırın (İstanbul günü için).

UPDATE class_sessions cs
SET status = 'scheduled',
    reminder_sent = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM message_logs ml
        WHERE ml.related_id = cs.id::text
          AND ml.kind = 'class_lesson_reminder'
          AND ml.status = 'sent'
      ) THEN false
      ELSE reminder_sent
    END
WHERE cs.status = 'completed'
  AND cs.lesson_date >= (timezone('Europe/Istanbul', now()))::date
  AND (
    cs.end_time IS NULL
    OR trim(cs.end_time::text) = ''
    OR cs.end_time::time <= time '00:00:01'
    OR (cs.end_time IS NOT NULL AND cs.start_time IS NOT NULL AND cs.end_time <= cs.start_time)
  )
  AND (cs.lesson_date + cs.start_time) AT TIME ZONE 'Europe/Istanbul' > timezone('Europe/Istanbul', now());
