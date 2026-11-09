-- Sınıf bazlı deneme otomasyonu. sql/2026-11-09-deneme-exam-notify.sql sonrası bir kez çalıştırın.

alter table public.deneme_exam_notify_targets
  add column if not exists enabled boolean not null default true;

alter table public.deneme_exam_notify_targets
  add column if not exists day_before_enabled boolean;

alter table public.deneme_exam_notify_targets
  add column if not exists soon_enabled boolean;

alter table public.deneme_exam_notify_targets
  add column if not exists karne_enabled boolean;

alter table public.deneme_exam_notify_targets
  add column if not exists join_link text;

alter table public.deneme_exam_notify_targets
  add column if not exists source_class_id text;

notify pgrst, 'reload schema';
