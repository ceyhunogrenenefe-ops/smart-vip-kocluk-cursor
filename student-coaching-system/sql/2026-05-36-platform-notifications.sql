-- Platform bildirimleri (admin / koç → hedef kitle)
-- NOT: users.id / institutions.id bu projede TEXT — UUID kullanmayın.
create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  sender_user_id text not null,
  sender_role text not null,
  sender_name text,
  institution_id text,
  title text not null,
  body text not null,
  target_type text not null check (target_type in ('broadcast', 'role', 'user')),
  target_role text,
  target_user_id text,
  target_institution_id text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  link_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_notifications_created
  on public.platform_notifications (created_at desc);

create index if not exists idx_platform_notifications_institution
  on public.platform_notifications (institution_id);

create table if not exists public.platform_notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.platform_notifications(id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create index if not exists idx_platform_notification_reads_user
  on public.platform_notification_reads (user_id, read_at desc);

alter table public.platform_notifications enable row level security;
alter table public.platform_notification_reads enable row level security;

comment on table public.platform_notifications is
  'Kurum içi platform bildirimleri; API service role ile yönetilir.';
