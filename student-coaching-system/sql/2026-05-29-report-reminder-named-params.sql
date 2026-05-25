-- Meta şablon gövdesi {{student_name}} (adlandırılmış) — class_absent_notice_1 ile aynı API modu
UPDATE message_templates
SET
  meta_named_body_parameters = true,
  variables = '["student_name"]'::jsonb,
  twilio_variable_bindings = '["student_name"]'::jsonb,
  meta_template_name = 'report_reminder',
  meta_template_language = COALESCE(NULLIF(TRIM(meta_template_language), ''), 'tr'),
  updated_at = NOW()
WHERE type = 'report_reminder';

NOTIFY pgrst, 'reload schema';
