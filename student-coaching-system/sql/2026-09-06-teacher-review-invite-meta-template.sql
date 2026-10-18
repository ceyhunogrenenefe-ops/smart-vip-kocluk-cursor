-- Veli → öğretmen değerlendirme daveti (ders sonrası WhatsApp)
-- Meta Business Manager / Mesaj Şablonları → "Meta'ya gönder" ile onaya düşer.
--
-- META:
--   Ad (API): ogretmen_yorum_daveti
--   Kategori: UTILITY
--   Dil: Turkish (tr)
--   Parametre: NAMED
--
-- Gövde (Meta'ya yapıştırılacak metin — uygulama ile aynı):
--   Sayın {{parent_name}},
--
--   {{student_name}} öğrencimizin {{teacher_name}} öğretmenimizle dersi tamamlandı.
--   Lütfen öğretmenimizi değerlendirin:
--   {{review_link}}
--
--   Online VIP Dershane
--
-- Değişkenler: parent_name, student_name, teacher_name, review_link
-- Cron: /api/cron/teacher-review-invites

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_synced_at TIMESTAMPTZ;

INSERT INTO message_templates (
  name,
  type,
  content,
  variables,
  twilio_variable_bindings,
  channel,
  is_active,
  meta_template_name,
  meta_template_language,
  meta_named_body_parameters,
  whatsapp_template_status,
  updated_at
)
VALUES (
  'Öğretmen yorum daveti (ders sonrası · veli)',
  'teacher_review_invite',
  'Sayın {{parent_name}},

{{student_name}} öğrencimizin {{teacher_name}} öğretmenimizle dersi tamamlandı.
Lütfen öğretmenimizi değerlendirin:
{{review_link}}

Online VIP Dershane',
  '["parent_name","student_name","teacher_name","review_link"]'::jsonb,
  '["parent_name","student_name","teacher_name","review_link"]'::jsonb,
  'whatsapp',
  true,
  'ogretmen_yorum_daveti',
  'tr',
  true,
  'PENDING_META_APPROVAL',
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = EXCLUDED.meta_named_body_parameters,
  whatsapp_template_status = COALESCE(
    message_templates.whatsapp_template_status,
    EXCLUDED.whatsapp_template_status
  ),
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
