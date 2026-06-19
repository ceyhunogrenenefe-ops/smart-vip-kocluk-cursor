-- Self-registration onayi: tum alanlarin users/students tarafina yazilmasi icin eksik kolonlar

alter table if exists public.pending_registrations
  add column if not exists parent_name text null,
  add column if not exists parent_phone_e164 text null,
  add column if not exists birth_date date null,
  add column if not exists class_level text null,
  add column if not exists branch text null,
  add column if not exists tc_identity_no text null;

alter table if exists public.users
  add column if not exists tc_identity_no text null;

alter table if exists public.students
  add column if not exists tc_identity_no text null,
  add column if not exists branch text null,
  add column if not exists class_level text null,
  add column if not exists parent_name text null,
  add column if not exists parent_phone text null,
  add column if not exists birth_date date null;

create index if not exists users_tc_identity_no_idx
  on public.users (tc_identity_no)
  where tc_identity_no is not null;

create index if not exists students_tc_identity_no_idx
  on public.students (tc_identity_no)
  where tc_identity_no is not null;

notify pgrst, 'reload schema';
