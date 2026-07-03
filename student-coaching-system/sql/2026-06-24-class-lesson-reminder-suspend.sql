-- Grup dersi WhatsApp hatırlatmalarını askıya al (Meta + cron + manuel gönderim)
-- Yeniden açmak: is_active = true + isteğe bağlı Vercel CLASS_LESSON_REMINDER_META_ENABLED=1

UPDATE message_templates
SET
  is_active = false,
  updated_at = NOW()
WHERE type = 'class_lesson_reminder';

COMMENT ON COLUMN message_templates.is_active IS
  'false ise grup dersi hatırlatma cron/manuel gönderim yapmaz. Meta için ayrıca CLASS_LESSON_REMINDER_META_ENABLED=1 gerekir.';

NOTIFY pgrst, 'reload schema';
