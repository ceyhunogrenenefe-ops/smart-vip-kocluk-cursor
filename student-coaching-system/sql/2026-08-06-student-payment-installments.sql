-- Öğrenci ödeme takip: taksitlendirme + hesap türü + TEB kredi kartı

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'bank'
    CHECK (account_type IN ('bank', 'credit_card'));

ALTER TABLE public.student_payment_records
  ADD COLUMN IF NOT EXISTS installment_group_id uuid NULL,
  ADD COLUMN IF NOT EXISTS installment_no int NULL,
  ADD COLUMN IF NOT EXISTS installment_count int NULL;

CREATE INDEX IF NOT EXISTS student_payment_records_installment_group_idx
  ON public.student_payment_records (installment_group_id);

CREATE INDEX IF NOT EXISTS payment_accounts_type_idx
  ON public.payment_accounts (account_type);

COMMENT ON COLUMN public.payment_accounts.account_type IS 'bank = vadesiz hesap, credit_card = kredi kartı';
COMMENT ON COLUMN public.student_payment_records.installment_group_id IS 'Aynı taksit planındaki satırları gruplar';

-- TEB kredi kartı hesabı (Songül Öğrenenefe)
INSERT INTO public.payment_accounts (label, bank_name, account_holder, account_type, notes, sort_order, active)
SELECT v.label, v.bank_name, v.account_holder, v.account_type, v.notes, v.sort_order, true
FROM (
  VALUES
    ('TEB Bankası — Songül Öğrenenefe — Kredi Kartı', 'TEB', 'Songül Öğrenenefe', 'credit_card', 'Kredi kartı tahsilat', 15)
) AS v(label, bank_name, account_holder, account_type, notes, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_accounts a WHERE a.label = v.label AND a.institution_id IS NULL
);
