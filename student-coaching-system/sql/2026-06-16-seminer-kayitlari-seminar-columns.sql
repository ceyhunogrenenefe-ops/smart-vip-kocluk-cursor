-- seminer_kayitlari: seminer tanımlayıcı kolonları (çoğu formda yok — bir kez ekleyin)
-- Supabase SQL Editor'da çalıştırın.

ALTER TABLE public.seminer_kayitlari
  ADD COLUMN IF NOT EXISTS seminer_key TEXT;

ALTER TABLE public.seminer_kayitlari
  ADD COLUMN IF NOT EXISTS seminer_adi TEXT;

ALTER TABLE public.seminer_kayitlari
  ADD COLUMN IF NOT EXISTS synced_participant_id UUID;

ALTER TABLE public.seminer_kayitlari
  ADD COLUMN IF NOT EXISTS synced_event_id UUID;

ALTER TABLE public.seminer_kayitlari
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.seminer_kayitlari.seminer_adi IS
  'Form / seminer adı — institution_events.seminar_sync_key ile eşleşir';

COMMENT ON COLUMN public.seminer_kayitlari.seminer_key IS
  'Kısa slug (isteğe bağlı); seminer_adi ile aynı işlev';

-- YKS semineri: mevcut kayıtları etiketle (tabloda başka seminer yoksa güvenli)
UPDATE public.seminer_kayitlari
SET seminer_adi = 'YKS Sınav Stresi Başarını Etkilemesin!'
WHERE seminer_adi IS NULL OR TRIM(seminer_adi) = '';

-- Yeniden eşitleme için işaretleri sıfırla (yalnızca bu seminer)
UPDATE public.seminer_kayitlari
SET synced_at = NULL,
    synced_participant_id = NULL,
    synced_event_id = NULL
WHERE seminer_adi = 'YKS Sınav Stresi Başarını Etkilemesin!';

CREATE INDEX IF NOT EXISTS seminer_kayitlari_unsynced_idx
  ON public.seminer_kayitlari (created_at)
  WHERE synced_at IS NULL;

NOTIFY pgrst, 'reload schema';
