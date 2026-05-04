-- Öğrenci ↔ öğretmen (platform users.id) canlı ders paketi (birim kotası)
-- Kullanılan birim: yalnızca teacher_lessons.status = completed satırları, süreye göre (lesson-duration-units.js)
-- credits_total NULL = sınırsız; 0 = paket yok; pozitif = üst birim sınırı (örn. 10 birimlik paket)
-- Supabase SQL Editor’da çalıştırın (teacher_lessons tablosu önceden oluşturulmuş olmalı).

CREATE TABLE IF NOT EXISTS student_teacher_lesson_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_total INT CHECK (credits_total IS NULL OR credits_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS st_lesson_quota_student_idx ON student_teacher_lesson_quota(student_id);
CREATE INDEX IF NOT EXISTS st_lesson_quota_teacher_idx ON student_teacher_lesson_quota(teacher_id);
CREATE INDEX IF NOT EXISTS st_lesson_quota_inst_idx ON student_teacher_lesson_quota(institution_id);

COMMENT ON TABLE student_teacher_lesson_quota IS 'Öğrencinin belirli bir öğretmenle alabileceği canlı ders üst sınırı (NULL=sınırsız).';
COMMENT ON COLUMN student_teacher_lesson_quota.credits_total IS 'NULL: kota yok; 0: ders yok; N: en fazla N ders (scheduled+completed toplamı).';

NOTIFY pgrst, 'reload schema';
