-- Özel ders aylık ücretleri: dış öğrenci + banka hesabı (mevcut tabloya ek)
-- Supabase SQL Editor'da çalıştırın. Hakediş tablolarına dokunmaz.

ALTER TABLE public.private_lesson_monthly_fees
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.private_lesson_monthly_fees
  ADD COLUMN IF NOT EXISTS external_student_name text NULL;

ALTER TABLE public.private_lesson_monthly_fees
  ADD COLUMN IF NOT EXISTS payment_account_id uuid NULL
    REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_lesson_monthly_fees_student_or_external_chk'
  ) THEN
    ALTER TABLE public.private_lesson_monthly_fees
      ADD CONSTRAINT private_lesson_monthly_fees_student_or_external_chk
      CHECK (
        (student_id IS NOT NULL AND length(trim(student_id)) > 0)
        OR (external_student_name IS NOT NULL AND length(trim(external_student_name)) > 0)
      );
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_private_lesson_monthly_fees_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_private_lesson_monthly_fees_period_v2
  ON public.private_lesson_monthly_fees (
    period_ym,
    COALESCE(institution_id, ''),
    COALESCE(student_id, ''),
    COALESCE(lower(trim(external_student_name)), '')
  );

CREATE INDEX IF NOT EXISTS idx_private_lesson_monthly_fees_payment_account
  ON public.private_lesson_monthly_fees (payment_account_id);

COMMENT ON COLUMN public.private_lesson_monthly_fees.external_student_name IS
  'Sistem dışı özel ders öğrencisi adı (student_id boşken).';
COMMENT ON COLUMN public.private_lesson_monthly_fees.payment_account_id IS
  'Tahsilatın yatırıldığı banka/kart hesabı (payment_accounts).';

NOTIFY pgrst, 'reload schema';
