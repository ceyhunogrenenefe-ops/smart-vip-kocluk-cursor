-- Günlük/haftalık çalışma kaydı: aynı takvim gününde bir öğrenci için birden fazla satıra izin ver.
-- Eski kurulumda (student_id, date) UNIQUE varsa INSERT ikinci kaydı reddeder.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'weekly_entries'
      AND c.contype = 'u'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%student_id%'
        AND pg_get_constraintdef(c.oid) ILIKE '%date%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.weekly_entries DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
