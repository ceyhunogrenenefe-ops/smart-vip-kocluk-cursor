-- Eski kitap_siparisleri şemasından yeni forma geçiş (tek seferde çalıştırın)
-- Form: kitap-siparis-formu.vercel.app

ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS veli_ad_soyad TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS ogrenci_ad_soyad TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS ucret_durumu TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS ilce TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS il TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS siparis_notu TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS form_payload JSONB;

UPDATE kitap_siparisleri SET veli_ad_soyad = veli_adi WHERE veli_ad_soyad IS NULL AND veli_adi IS NOT NULL;
UPDATE kitap_siparisleri SET ogrenci_ad_soyad = ogrenci_adi WHERE ogrenci_ad_soyad IS NULL AND ogrenci_adi IS NOT NULL;
UPDATE kitap_siparisleri SET siparis_notu = notlar WHERE siparis_notu IS NULL AND notlar IS NOT NULL;

ALTER TABLE kitap_siparisleri ALTER COLUMN telefon DROP NOT NULL;
ALTER TABLE kitap_siparisleri ALTER COLUMN kitaplar DROP NOT NULL;
ALTER TABLE kitap_siparisleri ALTER COLUMN ogrenci_adi DROP NOT NULL;

ALTER TABLE kitap_siparisleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitap_siparisleri_anon_insert ON kitap_siparisleri;

CREATE POLICY kitap_siparisleri_anon_insert ON kitap_siparisleri
  FOR INSERT
  TO anon
  WITH CHECK (
    institution_id IS NOT NULL
    AND status = 'pending'
    AND whatsapp_status = 'awaiting_approval'
  );

NOTIFY pgrst, 'reload schema';
