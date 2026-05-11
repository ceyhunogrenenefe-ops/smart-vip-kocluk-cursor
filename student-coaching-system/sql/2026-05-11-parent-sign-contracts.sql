-- Hızlı veli onayı + e-imza (Supabase SQL Editor)
-- Önceki PDF şablon tabloları kullanılmıyorsa yoksayın; bu tablo bağımsızdır.

CREATE TABLE IF NOT EXISTS public.parent_sign_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  created_by TEXT NULL,
  ogrenci_ad TEXT NOT NULL DEFAULT '',
  ogrenci_soyad TEXT NOT NULL DEFAULT '',
  veli_ad TEXT NOT NULL DEFAULT '',
  veli_soyad TEXT NOT NULL DEFAULT '',
  telefon TEXT NOT NULL DEFAULT '',
  adres TEXT NOT NULL DEFAULT '',
  sinif TEXT NOT NULL DEFAULT '',
  program_adi TEXT NOT NULL DEFAULT '',
  baslangic_tarihi DATE NOT NULL,
  bitis_tarihi DATE NOT NULL,
  haftalik_ders_saati NUMERIC NOT NULL DEFAULT 0,
  ucret NUMERIC NOT NULL DEFAULT 0,
  kurum_kodu TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL UNIQUE,
  verify_token TEXT NOT NULL UNIQUE,
  signing_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed')),
  merged_html TEXT NOT NULL,
  signature_png_base64 TEXT NULL,
  terms_accepted_at TIMESTAMPTZ NULL,
  signer_ip TEXT NULL,
  signer_user_agent TEXT NULL,
  signed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_sign_contracts_institution_idx ON public.parent_sign_contracts(institution_id);
CREATE INDEX IF NOT EXISTS parent_sign_contracts_signing_idx ON public.parent_sign_contracts(signing_token);
CREATE INDEX IF NOT EXISTS parent_sign_contracts_verify_idx ON public.parent_sign_contracts(verify_token);
CREATE INDEX IF NOT EXISTS parent_sign_contracts_created_idx ON public.parent_sign_contracts(created_at DESC);

COMMENT ON TABLE public.parent_sign_contracts IS 'Manuel girilen öğrenci/veli bilgisi + otomatik ücret/saat/kurum kodu; veli imza linki ile tamamlanır.';
