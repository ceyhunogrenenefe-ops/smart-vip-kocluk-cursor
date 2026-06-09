-- Seminer kayıtları (seminer_kayitlari) → etkinlik katılımcıları otomatik eşleme
-- Supabase SQL Editor'da bir kez çalıştırın.

ALTER TABLE institution_events
  ADD COLUMN IF NOT EXISTS seminar_sync_key TEXT;

ALTER TABLE institution_events
  ADD COLUMN IF NOT EXISTS seminar_auto_send BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN institution_events.seminar_sync_key IS
  'seminer_kayitlari.seminer_key / seminer_adi / form_adi ile eşleşir; yalnızca bu anahtarlı kayıtlar çekilir';

ALTER TABLE institution_event_participants
  ADD COLUMN IF NOT EXISTS seminar_registration_id TEXT;

CREATE INDEX IF NOT EXISTS idx_institution_event_participants_seminar_reg
  ON institution_event_participants (seminar_registration_id)
  WHERE seminar_registration_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'seminer_kayitlari'
  ) THEN
    ALTER TABLE public.seminer_kayitlari
      ADD COLUMN IF NOT EXISTS synced_participant_id UUID;
    ALTER TABLE public.seminer_kayitlari
      ADD COLUMN IF NOT EXISTS synced_event_id UUID;
    ALTER TABLE public.seminer_kayitlari
      ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS seminer_kayitlari_unsynced_idx
      ON public.seminer_kayitlari (created_at)
      WHERE synced_at IS NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
