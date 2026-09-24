-- Öğretmen başvurusuna gönderilecek Meta onaylı şablon (2026-09-24) — üretimde uygulandı.
-- Geriye uyumlu: yalnız sütun eklenir.

alter table public.crm_settings
  add column if not exists teacher_application_template text;

alter table public.crm_settings
  add column if not exists teacher_application_template_lang text;
