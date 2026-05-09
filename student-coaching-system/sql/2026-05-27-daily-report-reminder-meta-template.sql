-- ============================================================================
-- Günlük rapor hatırlatması — Meta WhatsApp şablonu + message_templates
-- Çalıştırın: Supabase SQL Editor (Production). Önce aşağıdaki sırayı uygulayın.
-- ============================================================================
--
-- ZORUNLU TABLO / MİGRASYON SIRASI (ilk kurulum veya eksik kolon varsa):
--   1) 2026-05-03-whatsapp-automation-templates-logs.sql  → message_templates, message_logs
--   2) 2026-05-07-whatsapp-production-templates.sql       → twilio_* kolonları (opsiyonel Twilio)
--   3) 2026-05-14-whatsapp-logs-phone.sql                  → message_logs.phone vb.
--   4) 2026-05-17-meta-whatsapp-cloud-api.sql             → meta_template_name, meta_template_language
--   5) 2026-05-23-class-lesson-reminder-template-upsert.sql → channel, is_active
--   6) 2026-05-25-cron-run-log.sql                        → cron_run_log (WhatsApp Merkezi / sağlık)
--
-- CRON (Vercel): kök vercel.json → "path": "/api/cron/daily-report-reminders"
--   Schedule UTC: 0 20 * * *  → İstanbul 23:00 (TR yıl boyu UTC+3).
--   Kod sözleşmesi: api/_lib/vercel-cron-contract.js → CRON_DAILY_REPORT_REMINDERS_UTC
--
-- META İŞ AKIŞI:
--   1) Meta Business → WhatsApp → Şablonlar’da bu dosyadaki meta_template_name ile şablon oluşturun/onaylatın.
--   2) Şablonda TEK değişken {{1}} = öğrenci adı (cron handlers/cron-report-check.js yalnızca student_name doldurur;
--      lesson_name/time/link boş gönderilir — bağlama listesine eklemeyin).
--   3) Şablon dil kodu (örn. tr) meta_template_language ile birebir aynı olmalı (#132001 hatası için).
--   4) Bu UPSERT’ten sonra Message Templates ekranından veya WhatsApp Merkezi’nden test edin.
--
-- ============================================================================

INSERT INTO message_templates (
  name,
  type,
  content,
  variables,
  twilio_variable_bindings,
  channel,
  is_active,
  meta_template_name,
  meta_template_language,
  updated_at
)
VALUES (
  'Günlük rapor hatırlatma — veli (Meta)',
  'report_reminder',
  'Sayın Veli,

{{student_name}} adlı öğrencinizin bugünkü günlük çalışma kaydı henüz sistemde görünmüyor.

Lütfen Smart Koçluk üzerinden haftalık takip / günlük girişini tamamlayınız.

Online VIP Dershane',
  '["student_name"]'::jsonb,
  '["student_name"]'::jsonb,
  'whatsapp',
  true,
  'daily_report_reminder',
  'tr',
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = COALESCE(message_templates.channel, EXCLUDED.channel),
  is_active = EXCLUDED.is_active,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  updated_at = NOW();

COMMENT ON COLUMN message_templates.meta_template_name IS
  'Meta Business şablon adı. Varsayılan daily_report_reminder — Meta''da farklı ise UPDATE ile değiştirin.';

NOTIFY pgrst, 'reload schema';
