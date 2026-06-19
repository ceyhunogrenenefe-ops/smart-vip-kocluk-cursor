-- Günlük rapor hatırlatması: Meta şablon + cron 22:00 İstanbul (UTC 0 19 * * *)
-- Supabase SQL Editor'de bir kez çalıştırın.

UPDATE message_templates
SET
  name = 'Günlük rapor hatırlatma — veli (Meta)',
  content = 'Sayın Veli,

{{student_name}} adlı öğrencinizin bugünkü günlük çalışma kaydı henüz sistemde görünmüyor.

Lütfen Online Vip Ders Koçluk üzerinden haftalık takibinizi tamamlayın.

Online VIP Dershane',
  variables = '["student_name"]'::jsonb,
  twilio_variable_bindings = '["student_name"]'::jsonb,
  meta_template_name = COALESCE(NULLIF(TRIM(meta_template_name), ''), 'report_reminder'),
  meta_template_language = COALESCE(NULLIF(TRIM(meta_template_language), ''), 'tr'),
  channel = 'whatsapp',
  is_active = true,
  updated_at = NOW()
WHERE type = 'report_reminder';

NOTIFY pgrst, 'reload schema';
