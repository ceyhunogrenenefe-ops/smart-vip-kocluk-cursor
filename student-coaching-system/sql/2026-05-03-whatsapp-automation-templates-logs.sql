-- Smart Koçluk: Twilio WhatsApp otomasyonu — şablonlar ve gönderim logları
-- Supabase SQL Editor’da çalıştırın.

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_templates_type_unique UNIQUE (type)
);

CREATE INDEX IF NOT EXISTS message_templates_type_idx ON message_templates (type);

COMMENT ON TABLE message_templates IS 'WhatsApp otomasyon şablonları (type: lesson_reminder, report_reminder).';
COMMENT ON COLUMN message_templates.variables IS 'Kullanılabilir değişken adları (örn. ["student_name","lesson_name","time","link"]).';

CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  related_id UUID REFERENCES teacher_lessons(id) ON DELETE SET NULL,
  message TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_date DATE NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS message_logs_student_idx ON message_logs (student_id);
CREATE INDEX IF NOT EXISTS message_logs_kind_date_idx ON message_logs (kind, log_date);

-- Başarılı gönderim başına: aynı ders / aynı gün raporu tekrarlanmasın (failed sonrası yeniden denenebilir)
CREATE UNIQUE INDEX IF NOT EXISTS ux_message_logs_lesson_reminder_sent
  ON message_logs (student_id, kind, related_id)
  WHERE kind = 'lesson_reminder' AND related_id IS NOT NULL AND status = 'sent';

CREATE UNIQUE INDEX IF NOT EXISTS ux_message_logs_report_reminder_sent_day
  ON message_logs (student_id, log_date)
  WHERE kind = 'report_reminder' AND status = 'sent';

COMMENT ON TABLE message_logs IS 'Otomasyon WhatsApp gönderim kaydı (Twilio).';

-- Varsayılan şablonlar
INSERT INTO message_templates (name, type, content, variables)
VALUES
  (
    'Ders hatırlatma',
    'lesson_reminder',
    'Merhaba {{student_name}}, {{time}} saatinde "{{lesson_name}}" dersiniz başlayacak (yaklaşık 10 dk). Katılım: {{link}}',
    '["student_name","lesson_name","time","link"]'::jsonb
  ),
  (
    'Rapor hatırlatma',
    'report_reminder',
    'Merhaba {{student_name}}, bugün günlük raporunuzu henüz girmediniz. Lütfen Smart Koçluk üzerinden haftalık takibinizi tamamlayın.',
    '["student_name"]'::jsonb
  )
ON CONFLICT (type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
