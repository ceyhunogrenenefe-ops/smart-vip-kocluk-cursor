-- Canlı ders süresi (dakika) — paket kotası “ders birimi” ile düşer (bkz. api/_lib/lesson-duration-units.js)
ALTER TABLE teacher_lessons
  ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 60;

ALTER TABLE teacher_lessons
  DROP CONSTRAINT IF EXISTS teacher_lessons_duration_minutes_check;

ALTER TABLE teacher_lessons
  ADD CONSTRAINT teacher_lessons_duration_minutes_check CHECK (duration_minutes >= 15 AND duration_minutes <= 600);

COMMENT ON COLUMN teacher_lessons.duration_minutes IS 'Planlanan ders süresi (dk). Kota: süreye göre ders birimi (örn. 1–45→1, 46–80→2).';

NOTIFY pgrst, 'reload schema';
