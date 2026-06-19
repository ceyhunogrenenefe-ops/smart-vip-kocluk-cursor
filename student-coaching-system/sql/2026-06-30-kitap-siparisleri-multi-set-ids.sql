-- Kitap siparişlerinde çoklu set seçimi desteği
-- public-submit payload: kitap_set_ids: ["uuid1","uuid2",...]

ALTER TABLE kitap_siparisleri
  ADD COLUMN IF NOT EXISTS kitap_set_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Eski kayıtlarla geriye uyum:
-- kitap_set_id doluysa kitap_set_ids dizisini ilk elemanla doldur.
UPDATE kitap_siparisleri
SET kitap_set_ids = jsonb_build_array(kitap_set_id)
WHERE (kitap_set_ids IS NULL OR kitap_set_ids = '[]'::jsonb)
  AND kitap_set_id IS NOT NULL;

COMMENT ON COLUMN kitap_siparisleri.kitap_set_ids IS 'Formda seçilen kitap seti id listesi (sıralı)';

NOTIFY pgrst, 'reload schema';
