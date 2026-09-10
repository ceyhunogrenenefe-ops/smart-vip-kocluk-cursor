-- Yoklama WA idempotency: aynı session+öğrenci+kind için tekrarlı "sent" kayıtlarını engelle
-- RUN IN SUPABASE SQL EDITOR (production) — geriye uyumlu

-- Absent veli bildirimi (başarılı gönderimler)
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_absent_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind IN ('class_absent_notice_1', 'class_absent_notice')
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

-- Geç katılım veli güncellemesi
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_late_update_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_attendance_late_update'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

-- Koç ders başına tek toplu rapor
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_coach_summary_sent
  ON message_logs (related_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_attendance_coach_summary'
    AND related_id IS NOT NULL;

-- Koç geç katılım delta (öğrenci başına)
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_coach_late_delta_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_attendance_coach_late_delta'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

COMMENT ON INDEX uq_message_logs_absent_sent IS
  'Duplicate WhatsApp koruması: aynı ders+öğrenci absent bildirimi bir kez sent';

NOTIFY pgrst, 'reload schema';
