-- Dışarıdan gelir: sistemde olmayan öğrenci / dış kayıt
-- student_id opsiyonel; external_student_name ile isim tutulur

ALTER TABLE public.student_payment_records
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.student_payment_records
  ADD COLUMN IF NOT EXISTS external_student_name text NULL;

-- payment_type: dis_gelir ekle (constraint yenile)
ALTER TABLE public.student_payment_records
  DROP CONSTRAINT IF EXISTS student_payment_records_payment_type_check;

ALTER TABLE public.student_payment_records
  ADD CONSTRAINT student_payment_records_payment_type_check
  CHECK (payment_type IN ('yazili', 'kitap', 'kurs', 'ozel_ders', 'dis_gelir', 'diger'));

CREATE INDEX IF NOT EXISTS student_payment_records_external_name_idx
  ON public.student_payment_records (external_student_name);

COMMENT ON COLUMN public.student_payment_records.external_student_name IS
  'Sistemde olmayan öğrenci / dışarıdan gelir adı (student_id null iken)';
