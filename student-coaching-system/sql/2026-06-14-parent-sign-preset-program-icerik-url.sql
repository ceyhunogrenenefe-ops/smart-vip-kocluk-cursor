-- Şablon: sitedeki program içerik sayfası linki (veli kayıt formunda gösterilir)

ALTER TABLE public.parent_sign_class_presets
  ADD COLUMN IF NOT EXISTS program_icerik_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.parent_sign_class_presets.program_icerik_url IS
  'Program içeriği sayfası (site içi /yol veya https://…). Veli kayıt formunda isteğe bağlı link.';

NOTIFY pgrst, 'reload schema';
