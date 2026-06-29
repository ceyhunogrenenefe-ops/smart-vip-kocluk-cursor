-- Soru Çözüm Randevu Sistemi (class_sessions / soru çözümü dersleri)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  slot_start TIME NOT NULL,
  slot_end TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  question_count TEXT NOT NULL DEFAULT '1',
  student_name TEXT NULL,
  student_class_level TEXT NULL,
  reminder_1h_sent BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_15m_sent BOOLEAN NOT NULL DEFAULT FALSE,
  teacher_brief_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_notified BOOLEAN NOT NULL DEFAULT FALSE,
  session_started_at TIMESTAMPTZ NULL,
  session_ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_lesson_slot_active
  ON appointments (lesson_id, slot_start)
  WHERE status IN ('scheduled', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_appointments_student ON appointments (student_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_teacher_date ON appointments (teacher_id, appointment_date, slot_start);
CREATE INDEX IF NOT EXISTS idx_appointments_lesson ON appointments (lesson_id, slot_start);

CREATE TABLE IF NOT EXISTS question_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_url TEXT NULL,
  mime_type TEXT NULL,
  original_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_files_appointment ON question_files (appointment_id);

CREATE TABLE IF NOT EXISTS appointment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  student_note TEXT NULL,
  teacher_note TEXT NULL,
  solved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE appointments IS 'Soru çözümü dersleri için 10 dk randevu slotları (class_sessions).';
COMMENT ON TABLE question_files IS 'Randevuya yüklenen soru görselleri / PDF.';

-- Supabase Storage: `solution-appointments` adlı public/private bucket oluşturun (service role upload).

NOTIFY pgrst, 'reload schema';
