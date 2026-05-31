-- Otomatik WhatsApp (günlük rapor hatırlatma, koç otomasyonu, ders hatırlatma) aç/kapa
ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS whatsapp_automation_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.institutions
  ADD COLUMN IF NOT EXISTS whatsapp_automation_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.students.whatsapp_automation_enabled IS
  'false ise cron otomatik WhatsApp mesajları bu öğrenciye gitmez.';

COMMENT ON COLUMN public.institutions.whatsapp_automation_enabled IS
  'false ise kurumdaki tüm öğrencilere otomatik WhatsApp cron mesajları gitmez.';
