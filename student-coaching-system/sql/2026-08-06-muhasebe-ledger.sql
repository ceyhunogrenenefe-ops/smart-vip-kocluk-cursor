-- Muhasebe: ekstra giderler + dönem/yaz kayıt ödeme türleri

-- 1) Ödeme türleri genişlet
ALTER TABLE public.student_payment_records
  DROP CONSTRAINT IF EXISTS student_payment_records_payment_type_check;

ALTER TABLE public.student_payment_records
  ADD CONSTRAINT student_payment_records_payment_type_check
  CHECK (payment_type IN (
    'yazili', 'kitap', 'kurs', 'ozel_ders',
    'donem_kayit', 'yaz_kayit', 'dis_gelir', 'diger'
  ));

-- 2) Kurum ekstra giderleri (öğretmen dışı)
CREATE TABLE IF NOT EXISTS public.institution_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NULL,
  item_date date NOT NULL DEFAULT (CURRENT_DATE),
  category text NOT NULL DEFAULT 'diger'
    CHECK (category IN (
      'kira', 'faturalar', 'maas', 'reklam', 'malzeme',
      'yazilim', 'ulasim', 'vergi', 'diger'
    )),
  title text NOT NULL,
  amount_tl numeric(12, 2) NOT NULL DEFAULT 0,
  note text NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institution_expense_items_inst_idx
  ON public.institution_expense_items (institution_id);
CREATE INDEX IF NOT EXISTS institution_expense_items_date_idx
  ON public.institution_expense_items (item_date);
CREATE INDEX IF NOT EXISTS institution_expense_items_category_idx
  ON public.institution_expense_items (category);

COMMENT ON TABLE public.institution_expense_items IS
  'Muhasebe ekstra giderler (öğretmen ödemeleri dışında)';
