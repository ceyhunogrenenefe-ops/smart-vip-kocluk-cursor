-- Özel ders öğretmeni ↔ öğrenci atamaları (koçluk ve grup sınıfından bağımsız)
-- Supabase SQL Editor'da çalıştırın.

CREATE TABLE IF NOT EXISTS teacher_private_lesson_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, student_id)
);

CREATE INDEX IF NOT EXISTS tpla_teacher_idx ON teacher_private_lesson_assignments(teacher_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS tpla_student_idx ON teacher_private_lesson_assignments(student_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS tpla_institution_idx ON teacher_private_lesson_assignments(institution_id);

COMMENT ON TABLE teacher_private_lesson_assignments IS 'Admin ataması: öğretmenin özel ders öğrencileri (grup sınıfı / koçluk dışı).';

NOTIFY pgrst, 'reload schema';
