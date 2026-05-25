-- topic_progress: institution_id (eski kurulumlarda eksik olabilir)
ALTER TABLE public.topic_progress
  ADD COLUMN IF NOT EXISTS institution_id text REFERENCES public.institutions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_topic_progress_institution
  ON public.topic_progress (institution_id)
  WHERE institution_id IS NOT NULL;

-- Mevcut satırları öğrenci kurumundan doldur
UPDATE public.topic_progress tp
SET institution_id = s.institution_id
FROM public.students s
WHERE tp.student_id = s.id
  AND tp.institution_id IS NULL
  AND s.institution_id IS NOT NULL;
