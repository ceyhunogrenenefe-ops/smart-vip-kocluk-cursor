-- Garanti BBVA sanal POS ödeme siparişleri / linkleri
-- Supabase SQL Editor'de çalıştırın.

CREATE TABLE IF NOT EXISTS public.garanti_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  public_token text NOT NULL UNIQUE,
  institution_id uuid NULL,
  student_payment_record_id uuid NULL REFERENCES public.student_payment_records(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Ödeme',
  amount_kurus integer NOT NULL CHECK (amount_kurus > 0),
  currency text NOT NULL DEFAULT 'TRY',
  installment_max integer NOT NULL DEFAULT 0 CHECK (installment_max >= 0 AND installment_max <= 12),
  installment_chosen integer NULL,
  customer_name text NULL,
  customer_email text NULL,
  customer_phone text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'redirected', 'paid', 'failed', 'cancelled')),
  paid_at timestamptz NULL,
  last_error text NULL,
  callback_json jsonb NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS garanti_payment_orders_status_idx
  ON public.garanti_payment_orders (status);

CREATE INDEX IF NOT EXISTS garanti_payment_orders_created_idx
  ON public.garanti_payment_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS garanti_payment_orders_institution_idx
  ON public.garanti_payment_orders (institution_id);

CREATE INDEX IF NOT EXISTS garanti_payment_orders_record_idx
  ON public.garanti_payment_orders (student_payment_record_id);

COMMENT ON TABLE public.garanti_payment_orders IS
  'Garanti NestPay 3D / ortak ödeme siparişleri; public_token ile /odeme/:token';
