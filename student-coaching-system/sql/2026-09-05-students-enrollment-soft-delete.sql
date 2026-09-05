-- Öğrenci soft-delete + kayıt durumu (kesin / deneme / kayıt sildirdi)
-- UserManagement filtresi ve kalıcı silme yerine arşivleme için.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS enrollment_status text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Mevcut satırlar: kesin kayıt
UPDATE public.students
SET enrollment_status = 'confirmed'
WHERE enrollment_status IS NULL OR btrim(enrollment_status) = '';

ALTER TABLE public.students
  ALTER COLUMN enrollment_status SET DEFAULT 'confirmed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_enrollment_status_check'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_enrollment_status_check
      CHECK (enrollment_status IN ('confirmed', 'trial', 'withdrawn'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_enrollment_status
  ON public.students (institution_id, enrollment_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_deleted_at
  ON public.students (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.students.enrollment_status IS
  'confirmed=kesin kayıt, trial=deneme dersi, withdrawn=kayıt sildirdi';
COMMENT ON COLUMN public.students.deleted_at IS
  'Soft-delete zamanı; doluysa öğrenci arşivde (kayıt sildirdi).';
