-- Kullanıcı başına eğitim dönemi (ör. 2025-2026, 2026-2027)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS academic_year_label TEXT;

COMMENT ON COLUMN users.academic_year_label IS 'Eğitim-öğretim yılı etiketi, örn. 2025-2026';
