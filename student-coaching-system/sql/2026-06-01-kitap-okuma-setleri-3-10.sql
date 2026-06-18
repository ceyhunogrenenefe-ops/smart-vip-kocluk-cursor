-- Veli kitap sipariş formu: 3–10. sınıf kitap okuma setleri
-- Supabase SQL Editor'de bir kez çalıştırın.

INSERT INTO kitap_siparis_setleri (institution_id, name, kitap_icerigi, siniflar, sort_order)
SELECT
  '73323d75-eea1-4552-8bba-d50555423589',
  v.name,
  v.kitap_icerigi,
  v.siniflar::jsonb,
  v.sort_order
FROM (VALUES
  (
    '3. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — hikaye, masal ve bilim (VIP okuma programı)',
    '["3"]',
    303
  ),
  (
    '4. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — hikaye, roman ve bilim (VIP okuma programı)',
    '["4"]',
    304
  ),
  (
    '5. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — hikaye, roman ve bilim (VIP okuma programı)',
    '["5"]',
    305
  ),
  (
    '6. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — hikaye, roman ve bilim (VIP okuma programı)',
    '["6"]',
    306
  ),
  (
    '7. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — roman, hikaye ve bilim (VIP okuma programı)',
    '["7"]',
    307
  ),
  (
    '8. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — roman, hikaye ve bilim (VIP okuma programı)',
    '["8"]',
    308
  ),
  (
    '9. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — roman, hikaye ve bilim (VIP okuma programı)',
    '["9"]',
    309
  ),
  (
    '10. Sınıf Kitap Okuma Seti',
    'Seviyeye uygun okuma kitapları — roman, hikaye ve bilim (VIP okuma programı)',
    '["10"]',
    310
  )
) AS v(name, kitap_icerigi, siniflar, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM kitap_siparis_setleri s
  WHERE s.institution_id = '73323d75-eea1-4552-8bba-d50555423589'
    AND s.name = v.name
);

NOTIFY pgrst, 'reload schema';
