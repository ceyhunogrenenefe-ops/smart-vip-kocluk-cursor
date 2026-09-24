-- CRM'den silinen mesajlar günlük rapora yansımasın (2026-09-24) — üretimde uygulandı.
-- Geriye uyumlu: yalnız sütun eklenir, veri silinmez.

alter table public.registration_channel_messages
  add column if not exists deleted_at timestamptz;

create index if not exists registration_channel_messages_deleted_idx
    on public.registration_channel_messages (institution_id, deleted_at, occurred_at);
