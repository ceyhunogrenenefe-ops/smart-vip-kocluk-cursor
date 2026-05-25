-- report_reminder Meta şablon adı + cron saati (İstanbul 22:00)
-- Meta Business Manager'daki onaylı şablon adı: report_reminder

UPDATE message_templates
SET
  meta_template_name = 'report_reminder',
  meta_template_language = COALESCE(NULLIF(TRIM(meta_template_language), ''), 'tr'),
  is_active = true,
  variables = '["student_name"]'::jsonb,
  twilio_variable_bindings = '["student_name"]'::jsonb,
  updated_at = NOW()
WHERE type = 'report_reminder'
  AND (
    meta_template_name IS NULL
    OR TRIM(meta_template_name) = ''
    OR meta_template_name = 'daily_report_reminder'
  );

NOTIFY pgrst, 'reload schema';
