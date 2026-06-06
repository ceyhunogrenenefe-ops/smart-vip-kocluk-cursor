-- Kurum etkinlikleri + katılımcılar + Meta WhatsApp davet şablonu
-- Supabase SQL Editor'da bir kez çalıştırın.

CREATE TABLE IF NOT EXISTS institution_events (
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

CREATE INDEX IF NOT EXISTS idx_institution_events_institution ON institution_events (institution_id, event_date DESC);

CREATE TABLE IF NOT EXISTS institution_event_participants (
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

CREATE INDEX IF NOT EXISTS idx_institution_event_participants_event ON institution_event_participants (event_id);

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;

-- Meta BM onaylı şablon: "Etkinlik Hatırlatma + Link" (UTILITY) — API adı meta_template_name ile birebir aynı olmalı
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
  meta_named_body_parameters = EXCLUDED.meta_named_body_parameters,
  channel = COALESCE(message_templates.channel, EXCLUDED.channel),
  is_active = COALESCE(message_templates.is_active, EXCLUDED.is_active),
  whatsapp_template_status = COALESCE(EXCLUDED.whatsapp_template_status, message_templates.whatsapp_template_status),
  updated_at = NOW();

COMMENT ON TABLE institution_events IS 'Kurum etkinlikleri — admin/koç/süper admin oluşturur; katılımcılara Meta şablon WhatsApp gönderilir.';

NOTIFY pgrst, 'reload schema';
