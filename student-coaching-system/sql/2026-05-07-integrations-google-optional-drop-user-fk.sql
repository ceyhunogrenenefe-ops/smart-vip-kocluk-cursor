-- OPSİYONEL: integrations_google.user_id → users(id) foreign key’ini kaldırır.
-- Demo JWT (demo-*) ile Google token kaydı yapmak için tipik sıra:
--   1) Bu dosyayı Supabase SQL Editor’da çalıştırın.
--   2) Vercel → Environment Variables → INTEGRATIONS_GOOGLE_NO_USER_FK = 1 (Production)
--   3) Redeploy
-- Üretimde FK + gerçek users kaydı kullanmanız önerilir.

ALTER TABLE integrations_google DROP CONSTRAINT IF EXISTS integrations_google_user_id_fkey;
