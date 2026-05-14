-- WhatsApp log: veli ayrı numara, öğrenci FK’siz manuel test, telefon bazlı ders dedupe
-- Supabase SQL Editor’da çalıştırın.
-- Rapor hatırlatma saati: Vercel cron UTC; İstanbul 22:00 = vercel.json’da 0 19 * * * (bknz. api/_lib/vercel-cron-contract.js)

ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE message_logs ALTER COLUMN student_id DROP NOT NULL;

DROP INDEX IF EXISTS ux_message_logs_lesson_reminder_sent;

CREATE UNIQUE INDEX IF NOT EXISTS ux_message_logs_lesson_reminder_sent
  ON message_logs (student_id, kind, related_id, COALESCE(phone, ''::text))
  WHERE kind = 'lesson_reminder' AND related_id IS NOT NULL AND status = 'sent';

INSERT INTO message_templates (name, type, content, variables)
VALUES
  (
    'Ders hatırlatma (veli)',
    'lesson_reminder_parent',
    'Merhaba, öğrencimiz {{student_name}} için canlı ders {{lessonTime}} saatinde başlayacaktır. Ders linki: {{lessonLink}}',
    '["student_name","lessonTime","lessonLink","lesson_name","time","link"]'::jsonb
  )
ON CONFLICT (type) DO UPDATE SET
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  updated_at = NOW();

UPDATE message_templates SET
  content = 'Merhaba {{student_name}}, canlı dersiniz {{lessonTime}} saatinde başlayacaktır. Ders linkiniz: {{lessonLink}}',
  variables = '["student_name","lessonTime","lessonLink","lesson_name","time","link"]'::jsonb,
  updated_at = NOW()
WHERE type = 'lesson_reminder';

UPDATE message_templates SET
  content = 'Merhaba {{student_name}}, bugün günlük çalışma raporunu henüz doldurmadın. Lütfen paneline girerek raporunu tamamla.',
  variables = '["student_name"]'::jsonb,
  twilio_variable_bindings = '["student_name"]'::jsonb,
  updated_at = NOW()
WHERE type = 'report_reminder';

NOTIFY pgrst, 'reload schema';
