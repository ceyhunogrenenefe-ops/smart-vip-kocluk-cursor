-- Meta kabul edildi ama teslim doğrulanmadı: status notified yerine approved kalsın
UPDATE kitap_siparisleri
SET status = 'approved', updated_at = NOW()
WHERE status = 'notified'
  AND COALESCE(whatsapp_status, '') NOT IN ('delivered', 'read', 'failed');

-- Eski whatsapp_status=sent → accepted (daha net etiket)
UPDATE kitap_siparisleri
SET whatsapp_status = 'accepted', updated_at = NOW()
WHERE whatsapp_status = 'sent'
  AND COALESCE(meta_delivery_status, '') NOT IN ('delivered', 'read');

NOTIFY pgrst, 'reload schema';
