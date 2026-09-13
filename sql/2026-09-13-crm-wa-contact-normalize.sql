-- CRM: mevcut konuşma contact_identifier'larını Meta WA formatına (90…) düzelt
-- Örn. 05xx… → 905xx…  |  opsiyonel tek seferlik onarım

UPDATE public.crm_conversations
SET contact_identifier = '90' || substr(contact_identifier, 2),
    updated_at = now()
WHERE channel = 'whatsapp'
  AND contact_identifier ~ '^0[5][0-9]{9}$';

UPDATE public.crm_conversations
SET contact_identifier = '90' || contact_identifier,
    updated_at = now()
WHERE channel = 'whatsapp'
  AND contact_identifier ~ '^[5][0-9]{9}$';
