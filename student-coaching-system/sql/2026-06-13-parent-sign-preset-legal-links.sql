-- Şablon başına KVKK / satış metni ve paylaşım linki (kurum varsayılanının üzerine yazar)

ALTER TABLE public.parent_sign_class_presets
  ADD COLUMN IF NOT EXISTS kvkk_doc_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS satis_doc_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS share_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.parent_sign_class_presets.kvkk_doc_url IS
  'Bu şablonla oluşturulan veli kaydında KVKK linki. Boşsa kurum varsayılanı.';

COMMENT ON COLUMN public.parent_sign_class_presets.satis_doc_url IS
  'Bu şablonla oluşturulan veli kaydında satış/ön bilgi linki. Boşsa kurum varsayılanı.';

COMMENT ON COLUMN public.parent_sign_class_presets.share_url IS
  'Şablon paylaşım linki. Boşsa /veli-onay?preset=ID. https://… veya /yol kabul edilir.';

NOTIFY pgrst, 'reload schema';
