-- Veli öncesi öğrenci kayıt formu (TC, okul, e-posta, il/ilçe vb.) + muhasebe özeti için JSON alanı
-- Supabase SQL Editor'da çalıştırın.

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS kayit_formu_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.parent_sign_contracts.kayit_formu_json IS
  'phase: needs_form|ready_to_sign; tc_kimlik, dogum_tarihi, okul_adi, eposta, il, ilce, veli_tel, ogrenci_tel, kvkk_form_ok, muhasebe_ozet, form_submitted_at';
