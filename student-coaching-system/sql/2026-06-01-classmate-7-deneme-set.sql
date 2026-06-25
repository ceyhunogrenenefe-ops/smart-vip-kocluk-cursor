-- Veli kitap sipariş formu: 7. Sınıf Classmate 5'li Deneme
-- Supabase SQL Editor'de bir kez çalıştırın (veya /api/cron/seed-kitap-set ile otomatik).

INSERT INTO kitap_siparis_setleri (institution_id, name, kitap_icerigi, siniflar, sort_order, product_url)
SELECT
  '73323d75-eea1-4552-8bba-d50555423589',
  v.name,
  v.kitap_icerigi,
  v.siniflar::jsonb,
  v.sort_order,
  v.product_url
FROM (VALUES
  (
    '7. Sınıf Classmate 5''li Deneme',
    '5 deneme — sözel (Türkçe, Sosyal Bilgiler, Din Kültürü, İngilizce) ve sayısal (Matematik, Fen) bölümler ayrı (Okyanus Classmate)',
    '["7"]',
    306,
    'https://okyanusokulkitap.com/Urun/19245/7-Sinif-Classmate-5li-Deneme'
  )
) AS v(name, kitap_icerigi, siniflar, sort_order, product_url)
WHERE NOT EXISTS (
  SELECT 1 FROM kitap_siparis_setleri s
  WHERE s.institution_id = '73323d75-eea1-4552-8bba-d50555423589'
    AND s.name = v.name
);

NOTIFY pgrst, 'reload schema';
