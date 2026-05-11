-- Şablonda ders bazlı haftalık saat listesi; sözleşmede anlık ders programı snapshot

ALTER TABLE public.parent_sign_class_presets
  ADD COLUMN IF NOT EXISTS ders_satirlari JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.parent_sign_class_presets.ders_satirlari IS '[{"ders_adi":"Matematik","haftalik_saat":4},…] — haftalık toplam haftalik_ders_saati ile tutarlı';

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS ders_programi_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.parent_sign_contracts.ders_programi_snapshot IS 'İmza anındaki ders–saat listesi (şablondan veya elle)';

-- Eski şablonlar: tek satırda mevcut toplam saat (kolon zaten var)
UPDATE public.parent_sign_class_presets p
SET ders_satirlari = jsonb_build_array(
  jsonb_build_object(
    'ders_adi', 'Genel',
    'haftalik_saat', LEAST(40::numeric, GREATEST(0, COALESCE(p.haftalik_ders_saati, 0)))
  )
)
WHERE (
    ders_satirlari IS NULL
    OR ders_satirlari = 'null'::jsonb
    OR ders_satirlari = '[]'::jsonb
  )
  AND COALESCE(p.haftalik_ders_saati, 0) > 0;
