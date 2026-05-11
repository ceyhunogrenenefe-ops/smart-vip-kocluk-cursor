-- Veli sözleşmesi: platform öğrenci hesabı (users.id) bağlantısı

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS ogrenci_user_id TEXT NULL;

COMMENT ON COLUMN public.parent_sign_contracts.ogrenci_user_id IS 'users.id — öğrenci kartı yokken sadece kullanıcı hesabı';
