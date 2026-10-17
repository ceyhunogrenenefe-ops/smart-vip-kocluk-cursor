-- Grup dersi WhatsApp hatırlatmalarını yeniden aç (2026-06-24 askısı kaldırılır)
-- Cron + manuel gönderim: is_active = true gerekir.
-- Geçici kapatma: Vercel CLASS_LESSON_REMINDER_ENABLED=0 (veya false/off/paused)

UPDATE message_templates
SET
  is_active = true,
  updated_at = NOW()
WHERE type = 'class_lesson_reminder'
  AND is_active IS DISTINCT FROM true;

COMMENT ON COLUMN message_templates.is_active IS
  'false ise ilgili otomasyon cron şablonu kullanmaz. Grup dersi hatırlatması için true olmalı; acil kapatma: CLASS_LESSON_REMINDER_ENABLED=0.';

NOTIFY pgrst, 'reload schema';
