-- Öğrenci ödeme takip (Muhasebe → Öğrenci ödemeleri)
-- Hesaplar: Ziraat Songül, Enpara Ceyhun vb.
-- Kayıtlar: yazılı / kitap / kurs / özel ders / diğer

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NULL,
  label text NOT NULL,
  bank_name text NULL,
  account_holder text NULL,
  iban text NULL,
  notes text NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_accounts_institution_idx
  ON public.payment_accounts (institution_id);
CREATE INDEX IF NOT EXISTS payment_accounts_active_idx
  ON public.payment_accounts (active);

CREATE TABLE IF NOT EXISTS public.student_payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NULL,
  student_id text NOT NULL,
  coach_id text NULL,
  class_level text NULL,
  payment_type text NOT NULL DEFAULT 'diger'
    CHECK (payment_type IN ('yazili', 'kitap', 'kurs', 'ozel_ders', 'diger')),
  payment_account_id uuid NULL REFERENCES public.payment_accounts (id) ON DELETE SET NULL,
  title text NULL,
  amount_total numeric(12, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TRY',
  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled')),
  due_date date NULL,
  paid_at date NULL,
  contact_phone text NULL,
  contact_name text NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_payment_records_institution_idx
  ON public.student_payment_records (institution_id);
CREATE INDEX IF NOT EXISTS student_payment_records_student_idx
  ON public.student_payment_records (student_id);
CREATE INDEX IF NOT EXISTS student_payment_records_status_idx
  ON public.student_payment_records (status);
CREATE INDEX IF NOT EXISTS student_payment_records_type_idx
  ON public.student_payment_records (payment_type);
CREATE INDEX IF NOT EXISTS student_payment_records_due_idx
  ON public.student_payment_records (due_date);

COMMENT ON TABLE public.payment_accounts IS 'Ödeme hesapları (Ziraat Songül, Enpara Ceyhun vb.)';
COMMENT ON TABLE public.student_payment_records IS 'Öğrenci ödeme takip satırları — yazılı, kitap, kurs vb.';

-- Varsayılan hesap şablonları (kurum null = global şablon; admin kopyalayabilir)
INSERT INTO public.payment_accounts (label, bank_name, account_holder, notes, sort_order, active)
SELECT v.label, v.bank_name, v.account_holder, v.notes, v.sort_order, true
FROM (
  VALUES
    ('Ziraat Bankası — Songül Öğrenenefe', 'Ziraat Bankası', 'Songül Öğrenenefe', 'Kurum hesabı', 10),
    ('Enpara — Ceyhun Öğrenenefe', 'Enpara', 'Ceyhun Öğrenenefe', 'Kurum hesabı', 20),
    ('Ziraat Bankası — Online VIP', 'Ziraat Bankası', 'Online VIP Dershane', NULL, 30)
) AS v(label, bank_name, account_holder, notes, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_accounts a WHERE a.label = v.label AND a.institution_id IS NULL
);
