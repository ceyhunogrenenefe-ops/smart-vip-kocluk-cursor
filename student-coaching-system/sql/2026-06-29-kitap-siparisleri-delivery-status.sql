-- Meta webhook teslimat durumu (accepted → delivered / failed)
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS meta_delivery_status TEXT;

COMMENT ON COLUMN kitap_siparisleri.meta_delivery_status IS 'Meta webhook: accepted|sent|delivered|read|failed';
COMMENT ON COLUMN kitap_siparisleri.whatsapp_status IS 'awaiting_approval | sending | accepted (Meta kuyruk) | delivered | sent (eski) | failed | skipped';

NOTIFY pgrst, 'reload schema';
