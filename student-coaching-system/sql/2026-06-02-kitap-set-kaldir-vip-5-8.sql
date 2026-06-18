-- Veli formu: birleşik "VIP 5–8. Sınıf Set" artık kullanılmıyor (sınıf bazlı setler var)
-- Supabase SQL Editor'de bir kez çalıştırın.

UPDATE kitap_siparis_setleri
SET
  is_active = false,
  updated_at = NOW()
WHERE institution_id = '73323d75-eea1-4552-8bba-d50555423589'
  AND (
    name = 'VIP 5–8. Sınıf Set'
    OR name = 'VIP 5-8. Sınıf Set'
    OR name ILIKE 'VIP 5%8%Sınıf Set%'
  )
  AND is_active = true;

NOTIFY pgrst, 'reload schema';
