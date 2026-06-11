-- kitap-siparis-formu.vercel.app → anon insert izni
-- Form doğrudan Supabase REST API ile kitap_siparisleri tablosuna yazar.

ALTER TABLE kitap_siparisleri ALTER COLUMN telefon DROP NOT NULL;

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
