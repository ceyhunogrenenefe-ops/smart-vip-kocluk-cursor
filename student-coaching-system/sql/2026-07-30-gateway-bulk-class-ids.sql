-- Gateway toplu mesaj: sınıf hedefleme (cron çalışırken güncel öğrenci listesi)
ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS target_class_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.target_class_ids IS
  'Gateway toplu mesaj UI — hedef sınıf id listesi; cron gönderiminde güncel class_students ile eşleşir.';
