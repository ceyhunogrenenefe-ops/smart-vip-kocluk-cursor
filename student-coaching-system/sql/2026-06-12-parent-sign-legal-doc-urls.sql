-- Veli kayıt formu: kurum başına KVKK ve satış metni bağlantıları (harici veya site içi)

ALTER TABLE public.parent_sign_institution_legal
  ADD COLUMN IF NOT EXISTS kvkk_doc_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS satis_doc_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.parent_sign_institution_legal.kvkk_doc_url IS
  'Veli formundaki KVKK linki. Boşsa /veli-kayit-metin/kvkk. https://… veya /yol kabul edilir.';

COMMENT ON COLUMN public.parent_sign_institution_legal.satis_doc_url IS
  'Veli formundaki satış/ön bilgi linki. Boşsa /veli-kayit-metin/satis-onbilgilendirme.';

NOTIFY pgrst, 'reload schema';
