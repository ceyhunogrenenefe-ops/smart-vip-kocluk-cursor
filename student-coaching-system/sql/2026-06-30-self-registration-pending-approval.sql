-- pending_registrations: self-registration onay kuyruğu
-- Smart Koçluk şeması: institutions.id / users.id = TEXT (diğer SQL dosyalarıyla aynı)

create table if not exists public.pending_registrations (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions(id) on delete set null,
  first_name text not null,
  last_name text not null,
  tc_identity_no text not null,
  email text not null,
  phone_e164 text not null,
  class_level text null,
  branch text null,
  parent_name text null,
  parent_phone_e164 text null,
  birth_date date null,
  requested_role text not null check (requested_role in ('admin', 'coach', 'teacher', 'student')),
  password_plain text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text null,
  approved_user_id text null references public.users(id) on delete set null,
  approved_by text null references public.users(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eski/yarım kurulum: institution_id yanlışlıkla uuid ise text'e çevir
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pending_registrations'
      and column_name = 'institution_id'
      and udt_name = 'uuid'
  ) then
    alter table public.pending_registrations
      drop constraint if exists pending_registrations_institution_id_fkey;
    alter table public.pending_registrations
      alter column institution_id type text using institution_id::text;
    alter table public.pending_registrations
      add constraint pending_registrations_institution_id_fkey
      foreign key (institution_id) references public.institutions(id) on delete set null;
  end if;
end $$;

create unique index if not exists pending_registrations_email_pending_uq
  on public.pending_registrations (lower(email))
  where status = 'pending';

create unique index if not exists pending_registrations_tc_pending_uq
  on public.pending_registrations (tc_identity_no)
  where status = 'pending';

create index if not exists pending_registrations_status_idx
  on public.pending_registrations (status, created_at desc);

create index if not exists pending_registrations_institution_status_idx
  on public.pending_registrations (institution_id, status, created_at desc);

notify pgrst, 'reload schema';
