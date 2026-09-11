-- Özel ders veli tahsilatı (aylık) — öğretmen hakediş tablolarına dokunmaz.
-- Supabase SQL Editor'da çalıştırın.

CREATE TABLE IF NOT EXISTS public.private_lesson_monthly_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL,
  student_id text NOT NULL,
  period_ym text NOT NULL CHECK (period_ym ~ '^\d{4}-\d{2}$'),
  hours_override numeric(12, 2) NULL CHECK (hours_override IS NULL OR hours_override >= 0),
  unit_price_tl numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price_tl >= 0),
  amount_collected_tl numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount_collected_tl >= 0),
  collection_status text NOT NULL DEFAULT 'unpaid'
    CHECK (collection_status IN ('unpaid', 'partial', 'paid')),
  notes text NULL,
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_private_lesson_monthly_fees_period
  ON public.private_lesson_monthly_fees (
    student_id,
    period_ym,
    COALESCE(institution_id, '')
  );

CREATE INDEX IF NOT EXISTS idx_private_lesson_monthly_fees_period_ym
  ON public.private_lesson_monthly_fees (period_ym);

CREATE INDEX IF NOT EXISTS idx_private_lesson_monthly_fees_institution
  ON public.private_lesson_monthly_fees (institution_id, period_ym);

COMMENT ON TABLE public.private_lesson_monthly_fees IS
  'Muhasebe — özel ders veli tahsilatı (birim ücret, saat override, tahsilat). Hakediş verisine yazmaz.';

NOTIFY pgrst, 'reload schema';
