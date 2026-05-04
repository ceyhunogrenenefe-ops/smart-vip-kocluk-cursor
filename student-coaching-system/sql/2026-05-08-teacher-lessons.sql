-- Canlı ders entegrasyonu: Zoom / Meet / BigBlueButton / diğer linklerle özel ders planlama
-- Smart Koçluk şeması: users / students / institutions.id = TEXT
-- Supabase → SQL Editor’da çalıştırın.

CREATE TABLE IF NOT EXISTS teacher_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  lesson_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  meeting_link TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('bbb', 'zoom', 'meet', 'other')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_lessons_teacher_idx ON teacher_lessons(teacher_id);
CREATE INDEX IF NOT EXISTS teacher_lessons_student_idx ON teacher_lessons(student_id);
CREATE INDEX IF NOT EXISTS teacher_lessons_institution_idx ON teacher_lessons(institution_id);
CREATE INDEX IF NOT EXISTS teacher_lessons_date_status_idx ON teacher_lessons(lesson_date, status);
CREATE INDEX IF NOT EXISTS teacher_lessons_platform_idx ON teacher_lessons(platform);

COMMENT ON TABLE teacher_lessons IS 'Öğretmen/koç tarafından link ile planlanan canlı dersler (BBB/Zoom/Meet).';

-- PostgREST / Supabase şema önbelleğini yenile (bazen tablo oluşturulduktan sonra API tabloyu görmeyebilir)
NOTIFY pgrst, 'reload schema';
