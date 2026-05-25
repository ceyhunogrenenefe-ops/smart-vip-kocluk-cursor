-- Şifre sıfırlama tokenları (e-posta ile bağlantı)
create table if not exists public.password_reset_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id, created_at desc);

create index if not exists password_reset_tokens_hash_idx
  on public.password_reset_tokens (token_hash)
  where used_at is null;

comment on table public.password_reset_tokens is 'Tek kullanımlık şifre sıfırlama bağlantıları (SHA-256 hash saklanır)';
