-- Koç lisans takibi: son giriş zamanı
alter table public.users
  add column if not exists last_login_at timestamptz;

create index if not exists idx_users_last_login on public.users(last_login_at);
