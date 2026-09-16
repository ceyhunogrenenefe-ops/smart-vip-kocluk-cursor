-- Ders düzenlenince (saat/öğretmen değişince) şablondan ikinci bir ders üretilmesini engeller.
-- Üretimde 2026-09-16 tarihinde uygulandı.
ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS origin_slot_id uuid NULL
  REFERENCES public.class_weekly_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_origin_slot_date
  ON public.class_sessions (origin_slot_id, lesson_date);

COMMENT ON COLUMN public.class_sessions.origin_slot_id IS
  'Oturumun üretildiği haftalık şablon. Ders düzenlenince şablondan ikinci kez üretilmesini engeller.';

UPDATE public.class_sessions s
SET origin_slot_id = w.id
FROM public.class_weekly_slots w
WHERE s.origin_slot_id IS NULL
  AND w.class_id = s.class_id
  AND w.day_of_week = EXTRACT(ISODOW FROM s.lesson_date)
  AND w.start_time = s.start_time
  AND COALESCE(w.teacher_id, '') = COALESCE(s.teacher_id, '')
  AND lower(btrim(COALESCE(w.subject, ''))) = lower(btrim(COALESCE(s.subject, '')));

-- Tur 2: öğretmeni değiştirilmiş oturumlar (gün + saat tekil eşleşme)
WITH unl AS (
  SELECT s.id, s.class_id, s.start_time,
         EXTRACT(ISODOW FROM s.lesson_date)::int AS dow
  FROM public.class_sessions s
  WHERE s.origin_slot_id IS NULL AND s.lesson_date >= current_date
),
m AS (
  SELECT u.id, (array_agg(w.id))[1] AS slot_id, count(w.id) AS n
  FROM unl u
  JOIN public.class_weekly_slots w
    ON w.class_id = u.class_id AND w.day_of_week = u.dow AND w.start_time = u.start_time
  GROUP BY u.id
)
UPDATE public.class_sessions s
SET origin_slot_id = m.slot_id
FROM m
WHERE s.id = m.id AND m.n = 1;

-- Tur 3: saati kaydırılmış oturumlar (gün + ders adı tekil eşleşme,
-- ve o şablon o tarihte başka bir oturuma bağlı değilse)
WITH unl AS (
  SELECT s.id, s.class_id, s.lesson_date, s.subject,
         EXTRACT(ISODOW FROM s.lesson_date)::int AS dow
  FROM public.class_sessions s
  WHERE s.origin_slot_id IS NULL AND s.lesson_date >= current_date
),
m AS (
  SELECT u.id, u.lesson_date, (array_agg(w.id))[1] AS slot_id, count(w.id) AS n
  FROM unl u
  JOIN public.class_weekly_slots w
    ON w.class_id = u.class_id AND w.day_of_week = u.dow
   AND lower(btrim(w.subject)) = lower(btrim(u.subject))
  GROUP BY u.id, u.lesson_date
)
UPDATE public.class_sessions s
SET origin_slot_id = m.slot_id
FROM m
WHERE s.id = m.id
  AND m.n = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.class_sessions x
    WHERE x.origin_slot_id = m.slot_id AND x.lesson_date = m.lesson_date
  );
