-- FAZ 4: CRM Web Push (tarayıcı / PWA) — yalnız ekleme
create table if not exists public.crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);
create index if not exists crm_push_subscriptions_user_idx on public.crm_push_subscriptions (user_id);
alter table public.crm_push_subscriptions enable row level security;

-- VAPID anahtarları (ilk kullanımda sunucu üretir; yalnız service role okur)
create table if not exists public.crm_push_config (
  id smallint primary key default 1 check (id = 1),
  vapid_public_key text not null,
  vapid_private_key text not null,
  subject text not null default 'mailto:info@dersonlinevipkocluk.com',
  created_at timestamptz not null default now()
);
alter table public.crm_push_config enable row level security;
