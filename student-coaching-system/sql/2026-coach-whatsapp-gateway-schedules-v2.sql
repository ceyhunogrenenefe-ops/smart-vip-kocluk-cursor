-- Gateway zamanlayıcı: tekrar modu + hedef öğrenci/sınıf filtreleri

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS repeat_mode text NOT NULL DEFAULT 'daily'
    CHECK (repeat_mode IN ('once', 'daily', 'weekly', 'interval'));

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS send_date_tr date;

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS weekday_tr smallint
    CHECK (weekday_tr IS NULL OR (weekday_tr >= 1 AND weekday_tr <= 7));

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS target_student_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS target_class_level text;

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS target_group_name text;

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS recipient_channel text NOT NULL DEFAULT 'student'
    CHECK (recipient_channel IN ('student', 'parent'));

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS task_default text;

COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.repeat_mode IS 'once | daily | weekly | interval (N gün)';
COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.send_date_tr IS 'Tek sefer modu: YYYY-MM-DD (İstanbul)';
COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.weekday_tr IS 'Haftalık mod: 1=Pzt … 7=Paz';
COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.target_student_ids IS 'Boş dizi = tüm koç öğrencileri; dolu = yalnız seçilen id listesi';
