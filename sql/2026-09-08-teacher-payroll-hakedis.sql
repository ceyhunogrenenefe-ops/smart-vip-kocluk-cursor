-- Öğretmen hakediş (payroll) — tip bazlı birim ücret + dönem kilidi + muhasebe gider bağlantısı
-- Mevcut teacher_group_lesson_rates / payouts / extra_items tablolarını bozmaz; ek katman.

-- 1) Tip bazlı varsayılan birim ücretler (40 dk periyot)
CREATE TABLE IF NOT EXISTS public.teacher_payroll_rates (
  teacher_id text PRIMARY KEY,
  institution_id uuid NULL,
  group_unit_price_tl numeric(12, 2) NOT NULL DEFAULT 500
    CHECK (group_unit_price_tl >= 0),
  private_unit_price_tl numeric(12, 2) NOT NULL DEFAULT 500
    CHECK (private_unit_price_tl >= 0),
  guidance_unit_price_tl numeric(12, 2) NOT NULL DEFAULT 500
    CHECK (guidance_unit_price_tl >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL
);

CREATE INDEX IF NOT EXISTS idx_teacher_payroll_rates_institution
  ON public.teacher_payroll_rates (institution_id);

COMMENT ON TABLE public.teacher_payroll_rates IS
  'Hakediş — öğretmen başına grup / özel / rehberlik birim ücreti (40 dk)';

-- Eski grup ücreti tablosu varsa seed et; yoksa sessizce atla
DO $$
BEGIN
  IF to_regclass('public.teacher_group_lesson_rates') IS NOT NULL THEN
    INSERT INTO public.teacher_payroll_rates (teacher_id, institution_id, group_unit_price_tl, updated_at)
    SELECT r.teacher_id, r.institution_id, r.unit_price_tl, COALESCE(r.updated_at, now())
    FROM public.teacher_group_lesson_rates r
    ON CONFLICT (teacher_id) DO NOTHING;
  END IF;
END $$;

-- 2) Dönem hakediş kartı (onaylanan sayılar + kilit + gider)
CREATE TABLE IF NOT EXISTS public.teacher_payroll_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id text NOT NULL,
  institution_id uuid NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  system_group_units numeric(12, 2) NOT NULL DEFAULT 0,
  system_private_units numeric(12, 2) NOT NULL DEFAULT 0,
  system_guidance_units numeric(12, 2) NOT NULL DEFAULT 0,
  approved_group_units numeric(12, 2) NOT NULL DEFAULT 0,
  approved_private_units numeric(12, 2) NOT NULL DEFAULT 0,
  approved_guidance_units numeric(12, 2) NOT NULL DEFAULT 0,
  group_unit_price_tl numeric(12, 2) NOT NULL DEFAULT 500,
  private_unit_price_tl numeric(12, 2) NOT NULL DEFAULT 500,
  guidance_unit_price_tl numeric(12, 2) NOT NULL DEFAULT 500,
  lesson_gross_tl numeric(12, 2) NOT NULL DEFAULT 0,
  extras_tl numeric(12, 2) NOT NULL DEFAULT 0,
  total_tl numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'paid')),
  locked boolean NOT NULL DEFAULT false,
  paid_at timestamptz NULL,
  paid_by text NULL,
  expense_item_id uuid NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_payroll_settlements_period
  ON public.teacher_payroll_settlements (
    teacher_id,
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_from,
    period_to
  );

CREATE INDEX IF NOT EXISTS idx_teacher_payroll_settlements_period
  ON public.teacher_payroll_settlements (period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_teacher_payroll_settlements_teacher
  ON public.teacher_payroll_settlements (teacher_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_teacher_payroll_settlements_status
  ON public.teacher_payroll_settlements (status);

COMMENT ON TABLE public.teacher_payroll_settlements IS
  'Hakediş dönem kartı — sistem/onay sayıları, birim ücretler, kilit ve muhasebe gider linki';

-- 3) Dinamik ek gelir / kesinti kalemleri
CREATE TABLE IF NOT EXISTS public.teacher_payroll_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NULL REFERENCES public.teacher_payroll_settlements(id) ON DELETE CASCADE,
  teacher_id text NOT NULL,
  institution_id uuid NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  label text NOT NULL,
  amount_tl numeric(12, 2) NOT NULL DEFAULT 0,
  note text NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_payroll_line_items_period
  ON public.teacher_payroll_line_items (teacher_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_teacher_payroll_line_items_settlement
  ON public.teacher_payroll_line_items (settlement_id);

COMMENT ON TABLE public.teacher_payroll_line_items IS
  'Hakediş ek kalemleri — serbest ad + tutar (+/-)';
