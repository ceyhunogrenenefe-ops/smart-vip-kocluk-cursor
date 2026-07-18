-- Canlı Özel Ders Profesyonel Modül
-- Mevcut teacher_lessons / student_teacher_lesson_quota / teacher_private_lesson_assignments korunur.
-- Supabase SQL Editor’da çalıştırın.

-- 1) Paket kataloğu
CREATE TABLE IF NOT EXISTS private_lesson_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lesson_count INT CHECK (lesson_count IS NULL OR lesson_count >= 0),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_lesson_packages_inst_idx
  ON private_lesson_packages(institution_id);
CREATE INDEX IF NOT EXISTS private_lesson_packages_active_idx
  ON private_lesson_packages(active);

COMMENT ON TABLE private_lesson_packages IS 'Canlı özel ders paket kataloğu (8/12/16/24/32/sınırsız).';
COMMENT ON COLUMN private_lesson_packages.lesson_count IS 'NULL veya is_unlimited=true → sınırsız.';

-- 2) Kota satırına ödeme / paket meta (mevcut tablo genişletilir)
ALTER TABLE student_teacher_lesson_quota
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES private_lesson_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_label TEXT,
  ADD COLUMN IF NOT EXISTS coach_id TEXT REFERENCES coaches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS class_level TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS weekly_lesson_count INT CHECK (weekly_lesson_count IS NULL OR weekly_lesson_count >= 0),
  ADD COLUMN IF NOT EXISTS duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  ADD COLUMN IF NOT EXISTS amount_total NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IS NULL OR payment_status IN ('paid', 'partial', 'overdue', 'unpaid', 'waived')),
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS enrollment_notes TEXT;

CREATE INDEX IF NOT EXISTS st_lesson_quota_payment_idx
  ON student_teacher_lesson_quota(payment_status);
CREATE INDEX IF NOT EXISTS st_lesson_quota_package_idx
  ON student_teacher_lesson_quota(package_id);
CREATE INDEX IF NOT EXISTS st_lesson_quota_coach_idx
  ON student_teacher_lesson_quota(coach_id);

COMMENT ON COLUMN student_teacher_lesson_quota.payment_status IS
  'paid|partial|overdue|unpaid|waived — öğretmen API yanıtlarında gizlenir.';

-- 3) Ders sonu yoklama + notlar (1:1 teacher_lessons)
CREATE TABLE IF NOT EXISTS teacher_lesson_session_meta (
  lesson_id UUID PRIMARY KEY REFERENCES teacher_lessons(id) ON DELETE CASCADE,
  attendance_status TEXT CHECK (
    attendance_status IS NULL OR attendance_status IN (
      'present', 'absent', 'late', 'cancelled', 'makeup'
    )
  ),
  topic TEXT,
  gains TEXT,
  gaps TEXT,
  homework TEXT,
  next_plan TEXT,
  notes TEXT,
  coach_note TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_lesson_session_meta_att_idx
  ON teacher_lesson_session_meta(attendance_status);

COMMENT ON TABLE teacher_lesson_session_meta IS 'Canlı özel ders yoklama + öğretmen/veli notları.';

-- 4) Ders dosya / link paylaşımları
CREATE TABLE IF NOT EXISTS teacher_lesson_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES teacher_lessons(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL DEFAULT 'link'
    CHECK (file_type IN ('pdf', 'video', 'animation', 'presentation', 'youtube', 'link', 'other')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_lesson_files_lesson_idx
  ON teacher_lesson_files(lesson_id);

COMMENT ON TABLE teacher_lesson_files IS 'Canlı özel ders altında paylaşılan PDF/video/YouTube vb.';

-- Seed: kurum genelinde varsayılan paketler (institution_id NULL = global şablon)
INSERT INTO private_lesson_packages (institution_id, name, lesson_count, is_unlimited, price, discount, duration_minutes, sort_order)
SELECT NULL, v.name, v.lesson_count, v.is_unlimited, 0, 0, 60, v.sort_order
FROM (VALUES
  ('8 Ders', 8, false, 10),
  ('12 Ders', 12, false, 20),
  ('16 Ders', 16, false, 30),
  ('24 Ders', 24, false, 40),
  ('32 Ders', 32, false, 50),
  ('Sınırsız', NULL, true, 60)
) AS v(name, lesson_count, is_unlimited, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM private_lesson_packages p
  WHERE p.institution_id IS NULL AND p.name = v.name
);

NOTIFY pgrst, 'reload schema';
