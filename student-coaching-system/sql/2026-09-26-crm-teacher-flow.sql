-- Öğretmen Başvuru Otomasyonu (2026-09-26) — üretimde uygulandı.
-- Öğrenci/veli akışından bağımsız açılıp kapanır. Yalnız sütun eklenir.

alter table public.crm_auto_greeting_settings
  add column if not exists teacher_flow_active boolean not null default false,
  add column if not exists teacher_channel_whatsapp boolean not null default true,
  add column if not exists teacher_channel_instagram boolean not null default true,
  add column if not exists teacher_channel_facebook boolean not null default true,
  add column if not exists teacher_message text,
  add column if not exists teacher_application_url text;

alter table public.crm_auto_greeting_sessions
  add column if not exists flow_kind text not null default 'student',
  add column if not exists teacher_status text,
  add column if not exists teacher_link_sent_at timestamptz;
