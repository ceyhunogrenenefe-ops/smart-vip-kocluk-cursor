-- Veli sözleşmesi: sınıf bazlı program / ücret / saat / taksit şablonları + sözleşmede taksit alanı

CREATE TABLE IF NOT EXISTS public.parent_sign_class_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  sinif TEXT NOT NULL DEFAULT '',
  program_adi TEXT NOT NULL DEFAULT '',
  haftalik_ders_saati NUMERIC NOT NULL DEFAULT 0,
  ucret NUMERIC NOT NULL DEFAULT 0,
  taksit_sayisi INTEGER NOT NULL DEFAULT 1 CHECK (taksit_sayisi >= 1 AND taksit_sayisi <= 48),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_sign_class_presets_institution_idx
  ON public.parent_sign_class_presets(institution_id);

COMMENT ON TABLE public.parent_sign_class_presets IS 'Kurum başına sınıf/program sözleşme özet şablonları (veli kaydı formunda seçilir).';

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS taksit_sayisi INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.parent_sign_contracts
  DROP CONSTRAINT IF EXISTS parent_sign_contracts_taksit_check;

ALTER TABLE public.parent_sign_contracts
  ADD CONSTRAINT parent_sign_contracts_taksit_check
  CHECK (taksit_sayisi >= 1 AND taksit_sayisi <= 48);
