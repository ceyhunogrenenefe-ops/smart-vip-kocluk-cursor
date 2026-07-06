-- Koç bazlı ders & görüşme kilidi (Online görüşmeler + canlı özel dersler)
-- Supabase SQL Editor'da çalıştırın.

ALTER TABLE IF EXISTS public.coaches
  ADD COLUMN IF NOT EXISTS lessons_meetings_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coaches.lessons_meetings_locked IS
  'true ise koç ve ona bağlı öğrenciler ders/görüşme oluşturamaz ve katılamaz.';

CREATE INDEX IF NOT EXISTS idx_coaches_lessons_meetings_locked
  ON public.coaches (lessons_meetings_locked)
  WHERE lessons_meetings_locked = true;

NOTIFY pgrst, 'reload schema';
