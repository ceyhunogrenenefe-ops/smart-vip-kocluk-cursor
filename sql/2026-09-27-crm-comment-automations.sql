-- Instagram yorum otomasyonu (uygulandı).
--
-- Seçilen gönderiye anahtar kelime yazana otomatik özel mesaj (ör. PDF linki)
-- ve isteğe bağlı olarak yorumun altına açık yanıt.
--
-- Meta'nın resmî "private reply" ucu kullanılır (recipient.comment_id):
-- bir yoruma YALNIZCA BİR KEZ ve yorumdan sonraki 7 gün içinde özel mesaj
-- gönderilebilir. Bu yüzden gönderim comment_id bazında tekilleştirilir —
-- crm_comment_automation_logs.comment_id üzerinde tekil indeks var ve kayıt
-- gönderimden ÖNCE atılır; aynı webhook iki kez gelirse ikinci mesaj çıkmaz.
create table if not exists public.crm_comment_automations (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  name text not null default '',
  platform text not null default 'instagram' check (platform in ('instagram')),
  media_id text,
  media_caption text,
  media_permalink text,
  media_thumbnail_url text,
  keywords text[] not null default '{}',
  match_whole_word boolean not null default true,
  dm_text text not null default '',
  reply_comment_text text,
  once_per_user boolean not null default true,
  is_active boolean not null default false,
  sent_count integer not null default 0,
  last_sent_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_comment_automations_active_idx
  on public.crm_comment_automations (platform, is_active) where is_active;
create index if not exists crm_comment_automations_media_idx
  on public.crm_comment_automations (media_id) where media_id is not null;

create table if not exists public.crm_comment_automation_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.crm_comment_automations (id) on delete cascade,
  institution_id text,
  comment_id text not null,
  media_id text,
  ig_user_id text,
  username text,
  matched_keyword text,
  dm_status text not null default 'pending',
  dm_error text,
  reply_status text,
  reply_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_comment_automation_logs_comment_unq
  on public.crm_comment_automation_logs (comment_id);
create index if not exists crm_comment_automation_logs_user_idx
  on public.crm_comment_automation_logs (automation_id, ig_user_id);

alter table public.crm_comment_automations enable row level security;
alter table public.crm_comment_automation_logs enable row level security;
