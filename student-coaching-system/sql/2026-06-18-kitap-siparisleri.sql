-- Kitap sipariş formu → Supabase tabloları + WhatsApp şablonu
-- institutions.id = TEXT (uuid değil)
-- Meta BM şablon adı: kitap_siparisi · dil: tr (iç type: kitap_siparis_bildirim)

CREATE TABLE IF NOT EXISTS kitapcilar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  bolge TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitapcilar_institution ON kitapcilar(institution_id);
CREATE INDEX IF NOT EXISTS idx_kitapcilar_active ON kitapcilar(institution_id, is_active);

CREATE TABLE IF NOT EXISTS kitap_siparisleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  veli_ad_soyad TEXT NOT NULL,
  ogrenci_ad_soyad TEXT NOT NULL,
  sinif TEXT,
  ucret_durumu TEXT,
  telefon TEXT NOT NULL,
  adres TEXT,
  ilce TEXT,
  il TEXT,
  siparis_notu TEXT,
  kitapci_id UUID REFERENCES kitapcilar(id) ON DELETE SET NULL,
  kitapci_adi TEXT,
  kitapci_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  whatsapp_status TEXT NOT NULL DEFAULT 'awaiting_approval',
  whatsapp_sent_at TIMESTAMPTZ,
  whatsapp_error TEXT,
  meta_message_id TEXT,
  source TEXT NOT NULL DEFAULT 'form',
  form_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitap_siparisleri_institution ON kitap_siparisleri(institution_id);
CREATE INDEX IF NOT EXISTS idx_kitap_siparisleri_whatsapp_pending ON kitap_siparisleri(whatsapp_status, created_at);
CREATE INDEX IF NOT EXISTS idx_kitap_siparisleri_created ON kitap_siparisleri(created_at DESC);

COMMENT ON TABLE kitapcilar IS 'Kitap sipariş bildirimi alacak kitapçılar';
COMMENT ON TABLE kitap_siparisleri IS 'Kitap sipariş formu kayıtları';
COMMENT ON COLUMN kitap_siparisleri.ucret_durumu IS 'Ödendi | Kapıda Ödeme | Havale Bekleniyor';
COMMENT ON COLUMN kitap_siparisleri.status IS 'pending (onay bekliyor) | approved | notified | confirmed | cancelled';
COMMENT ON COLUMN kitap_siparisleri.whatsapp_status IS 'awaiting_approval | pending (onay sonrası) | sent | failed | skipped';

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;

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
  'Kitap siparişi — kitapçı bildirimi',
  'kitap_siparis_bildirim',
  E'📚 KİTAP SİPARİŞ FORMU\nVeli Ad Soyad:\n{{veli_ad_soyad}}\nÖğrenci Ad Soyad:\n{{ogrenci_ad_soyad}}\nSınıf:\n{{sinif}}\nÜcret Durumu:\n☐ Ödendi\n☐ Kapıda Ödeme\n☐ Havale Bekleniyor\nTelefon:\n{{telefon}}\nAdres:\n{{adres}}\nİlçe:\n{{ilce}}\nİl:\n{{il}}\n──────────────────\nOnline VIP Dershane öğrencisi için kitap siparişi oluşturulmuştur. Kargo işlemleri tamamlandığında takip numarasının tarafımıza iletilmesini rica ederiz.',
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","telefon","adres","ilce","il"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","telefon","adres","ilce","il"]'::jsonb,
  'whatsapp',
  true,
  'kitap_siparisi',
  'tr',
  true,
  'APPROVED',
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = true,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = COALESCE(EXCLUDED.meta_named_body_parameters, message_templates.meta_named_body_parameters),
  whatsapp_template_status = COALESCE(EXCLUDED.whatsapp_template_status, message_templates.whatsapp_template_status),
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
