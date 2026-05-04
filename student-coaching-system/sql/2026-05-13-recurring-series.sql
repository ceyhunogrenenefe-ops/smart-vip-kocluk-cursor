-- Tekrarlayan online görüşme ve canlı ders serileri
-- Supabase SQL Editor’da çalıştırın.

CREATE TABLE IF NOT EXISTS meeting_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  coach_id TEXT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  interval_days INT NOT NULL CHECK (interval_days IN (7, 15)),
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes >= 15 AND duration_minutes <= 600),
  recurrence_until_date DATE NOT NULL,
  meet_link TEXT NOT NULL,
  link_zoom TEXT,
  link_bbb TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_series_coach_idx ON meeting_series(coach_id);
CREATE INDEX IF NOT EXISTS meeting_series_student_idx ON meeting_series(student_id);

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES meeting_series(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS meetings_series_idx ON meetings(series_id);

CREATE TABLE IF NOT EXISTS teacher_lesson_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_link TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('bbb', 'zoom', 'meet', 'other')),
  interval_days INT NOT NULL CHECK (interval_days IN (7, 15)),
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes >= 15 AND duration_minutes <= 600),
  recurrence_until_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_lesson_series_teacher_idx ON teacher_lesson_series(teacher_id);
CREATE INDEX IF NOT EXISTS teacher_lesson_series_student_idx ON teacher_lesson_series(student_id);

ALTER TABLE teacher_lessons ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES teacher_lesson_series(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS teacher_lessons_series_idx ON teacher_lessons(series_id);

COMMENT ON TABLE meeting_series IS 'Tekrarlayan koçluk görüşmesi şablonu; meetings satırları series_id ile bağlanır.';
COMMENT ON TABLE teacher_lesson_series IS 'Tekrarlayan canlı ders şablonu; teacher_lessons series_id ile bağlanır.';

NOTIFY pgrst, 'reload schema';
