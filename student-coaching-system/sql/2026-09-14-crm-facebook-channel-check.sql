-- Facebook / Instagram CRM channel CHECK onarımı
-- Production'da crm_conversations CHECK bazen yalnızca whatsapp|instagram içeriyor;
-- Facebook Messenger DM / CTM / feed yorumları sessizce CRM'e yazılamıyor.
-- Supabase SQL Editor'da bir kez çalıştırın.

ALTER TABLE public.crm_conversations DROP CONSTRAINT IF EXISTS crm_conversations_channel_check;
ALTER TABLE public.crm_conversations ADD CONSTRAINT crm_conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook'));

ALTER TABLE public.registration_channel_messages DROP CONSTRAINT IF EXISTS registration_channel_messages_channel_check;
ALTER TABLE public.registration_channel_messages ADD CONSTRAINT registration_channel_messages_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook'));

-- Opsiyonel: fb: fallback satırlarını native facebook kanalına taşı
-- UPDATE public.crm_conversations
-- SET channel = 'facebook',
--     contact_identifier = substr(contact_identifier, 4),
--     ad_source_data = coalesce(ad_source_data, '{}'::jsonb) || jsonb_build_object('migrated_from_fb_prefix', true)
-- WHERE channel = 'instagram' AND contact_identifier LIKE 'fb:%';
