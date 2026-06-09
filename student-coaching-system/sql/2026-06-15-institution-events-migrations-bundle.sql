-- Etkinlik modülü ek migration'ları (tablolar zaten varsa güvenle çalıştırın)
-- Önce: 2026-06-08-institution-events-full-setup.sql

-- Planlama
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS send_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ;
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS daily_send_time TIME;
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS schedule_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS last_schedule_run_at TIMESTAMPTZ;

-- Şablon değişkenleri
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS template_vars JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seminer senkronu
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS seminar_sync_key TEXT;
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS seminar_auto_send BOOLEAN NOT NULL DEFAULT true;

-- Katılımcı kaynağı
ALTER TABLE institution_event_participants ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'student';

-- Seminer kayıt eşlemesi (seminer_kayitlari varsa)
ALTER TABLE institution_event_participants ADD COLUMN IF NOT EXISTS seminar_registration_id TEXT;

CREATE INDEX IF NOT EXISTS idx_institution_event_participants_seminar_reg
  ON institution_event_participants (seminar_registration_id)
  WHERE seminar_registration_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'seminer_kayitlari'
  ) THEN
    ALTER TABLE public.seminer_kayitlari ADD COLUMN IF NOT EXISTS synced_participant_id UUID;
    ALTER TABLE public.seminer_kayitlari ADD COLUMN IF NOT EXISTS synced_event_id UUID;
    ALTER TABLE public.seminer_kayitlari ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS seminer_kayitlari_unsynced_idx
      ON public.seminer_kayitlari (created_at)
      WHERE synced_at IS NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
