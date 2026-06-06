-- ETKİNLİK MODÜLÜ — TEK SEFERDE ÇALIŞTIRIN (Supabase SQL Editor)
-- Tablolar + WhatsApp şablonu. Eski hatalı sürüm varsa DROP ile temizler.

DROP TABLE IF EXISTS institution_event_participants;
DROP TABLE IF EXISTS institution_events;

CREATE TABLE institution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  event_time TIME,
  location TEXT,
  meeting_link TEXT,
  template_type TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institution_events_institution ON institution_events (institution_id, event_date DESC);

CREATE TABLE institution_event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES institution_events(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp_status TEXT NOT NULL DEFAULT 'pending',
  whatsapp_error TEXT,
  whatsapp_sent_at TIMESTAMPTZ,
  meta_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institution_event_participants_event ON institution_event_participants (event_id);

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;

INSERT INTO message_templates (
  type,
  name,
  content,
  variables,
  twilio_variable_bindings,
  meta_template_name,
  meta_template_language,
  meta_named_body_parameters,
  channel,
  is_active,
  whatsapp_template_status
)
VALUES (
  'institution_event_invite',
  'Etkinlik Hatırlatma + Link',
  E'Merhaba {{ad}} 👋\n{{etkinlik}} etkinliğimiz yaklaşıyor!\n📅 {{tarih}} — 🕒 {{saat}}\nAşağıdaki bağlantıdan katılabilirsiniz:\n🔗 {{link}}\nSizi aramızda görmek isteriz. 🌸',
  '["ad","etkinlik","tarih","saat","link"]'::jsonb,
  '["ad","etkinlik","tarih","saat","link"]'::jsonb,
  'etkinlik_hatirlatma_link_891bes',
  'tr',
  false,
  'whatsapp',
  true,
  'APPROVED'
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = false,
  channel = COALESCE(message_templates.channel, EXCLUDED.channel),
  is_active = true,
  whatsapp_template_status = COALESCE(EXCLUDED.whatsapp_template_status, message_templates.whatsapp_template_status),
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
