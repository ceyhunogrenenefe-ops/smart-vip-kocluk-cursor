-- Kitap sipariş formu: Karekök / Paraf setleri + ürün linki kolonu
-- Supabase SQL Editor'de bir kez çalıştırın.

ALTER TABLE kitap_siparis_setleri
  ADD COLUMN IF NOT EXISTS product_url TEXT NULL;

COMMENT ON COLUMN kitap_siparis_setleri.product_url IS 'Yayınevi ürün sayfası (veli formunda kitap detayı linki)';

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
    '5.Sınıf Karekök Matematik-Fen Kitabı',
    'Matematik MPS, Fen Bilimleri MPS (Karekök Yayınları)',
    '["5"]',
    6,
    'https://www.karekok.com.tr/yayinlarimiz/5-sinif/moduler-piramit-sistemi-serisi/5sinif-matematik-mps-moduler-piramit-sistemi-524.html'
  ),
  (
    '6.Sınıf Karekök Matematik-Fen Kitabı',
    'Matematik MPS, Fen Bilimleri MPS (Karekök Yayınları)',
    '["6"]',
    16,
    'https://www.karekok.com.tr/yayinlarimiz/6-sinif/moduler-piramit-sistemi-serisi/6-sinif-matematik-230.html'
  ),
  (
    '8.Sınıf Karekök Set',
    'LGS Tüm Dersler Soru Bankası — Türkçe, Matematik, Fen, İnkılap, Din, İngilizce',
    '["8"]',
    55,
    'https://www.karekok.com.tr/yayinlarimiz/8-sinif/soru-kitaplari-serisi/lgs-tum-dersler-soru-bankasi-745.html'
  ),
  (
    '8.Sınıf Paraf Set',
    '8. Sınıf Tüm Dersler Soru Kütüphaneleri (Paraf Yayınları)',
    '["8"]',
    56,
    'https://parafyayinlari.com/8-sinif/8-sinif-tum-dersler-soru-kutuphaneleri'
  )
) AS v(name, kitap_icerigi, siniflar, sort_order, product_url)
WHERE NOT EXISTS (
  SELECT 1 FROM kitap_siparis_setleri s
  WHERE s.institution_id = '73323d75-eea1-4552-8bba-d50555423589'
    AND s.name = v.name
);

NOTIFY pgrst, 'reload schema';
