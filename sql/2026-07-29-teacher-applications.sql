-- Dış öğretmen başvuruları (site formu → vitrin onay kuyruğu)
create extension if not exists pgcrypto;

create table if not exists public.teacher_applications (
  id text primary key default gen_random_uuid()::text,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone_e164 text,
  branch text not null,
  experience_label text,
  experience_years int,
  address_text text,
  university text,
  graduation_year int,
  short_bio text,
  full_bio text,
  photo_url text,
  intro_video_url text,
  lesson_video_url text,
  instagram_url text,
  youtube_url text,
  grade_levels text[] not null default '{}',
  kvkk_accepted_at timestamptz,
  source text not null default 'website',
  status text not null default 'received'
    check (status in ('received', 'linked', 'failed', 'rejected')),
  user_id text references public.users(id) on delete set null,
  profile_id text references public.teacher_profiles(id) on delete set null,
  ip_address text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_applications_email_created_idx
  on public.teacher_applications (lower(email), created_at desc);

create index if not exists teacher_applications_status_idx
  on public.teacher_applications (status, created_at desc);
