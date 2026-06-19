-- Kitap sipariş / kitapçı verisi kontrolü (Supabase SQL Editor)
-- Kayıtlar "silinmiş" görünüyorsa önce bu sorguları çalıştırın.

SELECT COUNT(*) AS kitapci_sayisi FROM kitapcilar;
SELECT COUNT(*) AS siparis_sayisi FROM kitap_siparisleri;

SELECT institution_id, COUNT(*) AS siparis
FROM kitap_siparisleri
GROUP BY institution_id
ORDER BY siparis DESC;

SELECT institution_id, COUNT(*) AS kitapci
FROM kitapcilar
GROUP BY institution_id
ORDER BY kitapci DESC;

-- Son 20 sipariş
SELECT id, institution_id, veli_ad_soyad, ogrenci_ad_soyad, status, created_at
FROM kitap_siparisleri
ORDER BY created_at DESC
LIMIT 20;

-- Sayılar 0 ise: Supabase Dashboard → Database → Backups / Point-in-Time Recovery
-- ile silinmeden önceki zamana geri dönün (Pro plan gerekir).
