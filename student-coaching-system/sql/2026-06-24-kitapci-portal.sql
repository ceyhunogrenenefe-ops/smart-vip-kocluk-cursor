-- Kitapçı paneli: token ile giriş, sipariş onayı ve kargo takibi

ALTER TABLE kitapcilar ADD COLUMN IF NOT EXISTS portal_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_kitapcilar_portal_token ON kitapcilar(portal_token) WHERE portal_token IS NOT NULL;

ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS kargo_takip_no TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS kitapci_notu TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS kitapci_confirmed_at TIMESTAMPTZ;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

COMMENT ON COLUMN kitapcilar.portal_token IS 'Kitapçı paneli gizli bağlantı anahtarı (/kitapci/:token)';
COMMENT ON COLUMN kitap_siparisleri.status IS 'pending | approved | notified | confirmed | shipped | cancelled';
COMMENT ON COLUMN kitap_siparisleri.kargo_takip_no IS 'Kitapçı panelinden girilen kargo takip numarası';

NOTIFY pgrst, 'reload schema';
