-- Veli onayı: para birimi + kurum başına tek seferlik sözleşme metinleri

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS para_birimi TEXT NOT NULL DEFAULT 'TRY';

COMMENT ON COLUMN public.parent_sign_contracts.para_birimi IS 'TRY | EUR | USD | GBP';

CREATE TABLE IF NOT EXISTS public.parent_sign_institution_legal (
  institution_id TEXT PRIMARY KEY REFERENCES public.institutions(id) ON DELETE CASCADE,
  satis_sozlesmesi TEXT NOT NULL DEFAULT '',
  kullanici_sozlesmesi TEXT NOT NULL DEFAULT '',
  gizlilik_politikasi TEXT NOT NULL DEFAULT '',
  kvkk_aydinlatma TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);

COMMENT ON TABLE public.parent_sign_institution_legal IS 'Kurum başına bir kez doldurulan satış/kullanıcı/gizlilik/KVKK metinleri — her veli kaydında otomatik eklenir.';

NOTIFY pgrst, 'reload schema';
