-- FAZ 1: Instagram / Facebook gönderen profili (yalnız ekleme, geriye uyumlu)
alter table public.crm_conversations
  add column if not exists contact_username text,
  add column if not exists contact_avatar_url text,
  add column if not exists profile_checked_at timestamptz,
  add column if not exists profile_error text;

alter table public.registration_leads
  add column if not exists instagram_username text,
  add column if not exists contact_avatar_url text;

create index if not exists crm_conversations_profile_missing_idx
  on public.crm_conversations (channel, profile_checked_at)
  where contact_username is null;
