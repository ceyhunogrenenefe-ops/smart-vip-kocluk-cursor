-- Kitap okuma: tamamlanma durumu (öğrenci «Kitabı bitirdim» + koç paneli senkronu)
ALTER TABLE public.book_readings
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.book_readings
SET status = 'completed'
WHERE status IS NULL
  AND end_date IS NOT NULL
  AND trim(coalesce(end_date::text, '')) <> '';

UPDATE public.book_readings
SET status = 'reading'
WHERE status IS NULL;

ALTER TABLE public.book_readings
  ALTER COLUMN status SET DEFAULT 'reading';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_readings_status_check'
  ) THEN
    ALTER TABLE public.book_readings
      ADD CONSTRAINT book_readings_status_check
      CHECK (status IN ('reading', 'completed', 'planned'));
  END IF;
END $$;
