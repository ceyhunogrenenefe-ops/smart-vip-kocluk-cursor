-- PARAF MAARİF MODEL TYT SET — veli kitap sipariş formu (Online VIP Dershane)
-- Yaz kampı: Matematik, Fizik, Kimya, Biyoloji (Türkçe, Tarih, Coğrafya yok)

-- Eski adlarla eklenmiş satırı güncelle
UPDATE kitap_siparis_setleri
SET
  name = 'PARAF MAARİF MODEL TYT SET',
  kitap_icerigi = 'Matematik, Fizik, Kimya, Biyoloji',
  updated_at = NOW()
WHERE institution_id = '73323d75-eea1-4552-8bba-d50555423589'
  AND name IN ('TYT MAARİF MODEL', 'PARAF MAARİF MODEL TYT SET');

-- Henüz yoksa ekle
INSERT INTO kitap_siparis_setleri (institution_id, name, kitap_icerigi, siniflar, sort_order)
SELECT
  '73323d75-eea1-4552-8bba-d50555423589',
  'PARAF MAARİF MODEL TYT SET',
  'Matematik, Fizik, Kimya, Biyoloji',
  '["9","10","11","12"]'::jsonb,
  15
WHERE NOT EXISTS (
  SELECT 1 FROM kitap_siparis_setleri s
  WHERE s.institution_id = '73323d75-eea1-4552-8bba-d50555423589'
    AND s.name IN ('TYT MAARİF MODEL', 'PARAF MAARİF MODEL TYT SET')
);

NOTIFY pgrst, 'reload schema';
