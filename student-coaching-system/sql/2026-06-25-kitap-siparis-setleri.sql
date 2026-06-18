-- Veli formunda seçilebilir VIP kitap setleri (admin CRUD)

CREATE TABLE IF NOT EXISTS kitap_siparis_setleri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kitap_icerigi TEXT NOT NULL,
  siniflar JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitap_siparis_setleri_institution
  ON kitap_siparis_setleri(institution_id, is_active, sort_order);

ALTER TABLE kitap_siparisleri
  ADD COLUMN IF NOT EXISTS kitap_set_id UUID REFERENCES kitap_siparis_setleri(id) ON DELETE SET NULL;

COMMENT ON TABLE kitap_siparis_setleri IS 'Veli kitap sipariş formunda seçilebilir kitap setleri';
COMMENT ON COLUMN kitap_siparis_setleri.siniflar IS 'Örn. ["9"], ["12"], ["5","6","7","8"] — form sınıf numarası ile eşleşir';

-- Varsayılan VIP setleri (Online VIP Dershane)
INSERT INTO kitap_siparis_setleri (institution_id, name, kitap_icerigi, siniflar, sort_order)
SELECT
  '73323d75-eea1-4552-8bba-d50555423589',
  v.name,
  v.kitap_icerigi,
  v.siniflar::jsonb,
  v.sort_order
FROM (VALUES
  ('VIP 9. Sınıf Set', 'Fizik, Kimya, Biyoloji, Edebiyat, Matematik', '["9"]', 10),
  ('VIP 10. Sınıf Set (VIP Yayınları)', 'Fizik, Kimya, Matematik, Biyoloji, Edebiyat', '["10"]', 20),
  ('11. Sınıf Sayısal VIP Set', 'Fizik, Kimya, Matematik, Biyoloji', '["11"]', 30),
  ('12. Sınıf VIP Sayısal Set — Konu Anlatım', 'Fizik, Kimya, Matematik, Biyoloji', '["12"]', 40),
  ('12. Sınıf VIP Eşit Ağırlık Set', 'Matematik, Türkçe, Edebiyat, Tarih, Coğrafya', '["12"]', 50)
) AS v(name, kitap_icerigi, siniflar, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM kitap_siparis_setleri s
  WHERE s.institution_id = '73323d75-eea1-4552-8bba-d50555423589'
    AND s.name = v.name
);

ALTER TABLE kitap_siparis_setleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitap_siparis_setleri_anon_select ON kitap_siparis_setleri;
CREATE POLICY kitap_siparis_setleri_anon_select ON kitap_siparis_setleri
  FOR SELECT TO anon
  USING (is_active = true);

NOTIFY pgrst, 'reload schema';
