-- Öğretmen vitrin profili (onlinevipdershane.com Özel Ders)
-- Kaynak: users (teacher). Tek profil / user_id (unique).

create extension if not exists pgcrypto;

create table if not exists public.teacher_profiles (
  id text primary key default gen_random_uuid()::text,
  user_id text not null unique references public.users(id) on delete cascade,
  integration_uuid uuid not null unique default gen_random_uuid(),
  slug text not null unique,
  status text not null default 'incomplete'
    check (status in (
      'draft', 'incomplete', 'pending_approval', 'published',
      'changes_pending', 'rejected', 'passive'
    )),
  is_active boolean not null default true,
  private_lesson_enabled boolean not null default true,
  first_name text,
  last_name text,
  display_name text,
  title text,
  branch text,
  subjects text[] not null default '{}',
  short_bio text,
  full_bio text,
  city text,
  online_lessons boolean not null default true,
  university text,
  department text,
  graduation_year int,
  experience_years int,
  institutions_worked text,
  specialties text[] not null default '{}',
  grade_levels text[] not null default '{}',
  exam_areas text[] not null default '{}',
  teaching_approach text,
  educations jsonb not null default '[]'::jsonb,
  experiences jsonb not null default '[]'::jsonb,
  photo_path text,
  photo_url text,
  video_url text,
  video_path text,
  lesson_duration_min int,
  lesson_format text default 'online',
  availability_note text,
  availability_link text,
  accepting_students boolean not null default true,
  completion_pct int not null default 0,
  rejection_reason text,
  published_snapshot jsonb,
  approved_at timestamptz,
  approved_by text references public.users(id) on delete set null,
  submitted_at timestamptz,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  last_synced_at timestamptz,
  source_system text not null default 'dersonlinevipkocluk',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists teacher_profiles_status_idx
  on public.teacher_profiles (status, is_active)
  where deleted_at is null;

create index if not exists teacher_profiles_slug_idx
  on public.teacher_profiles (slug)
  where deleted_at is null;

create table if not exists public.teacher_profile_revisions (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null references public.teacher_profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'rejected')),
  payload jsonb not null default '{}'::jsonb,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_profile_revisions_profile_idx
  on public.teacher_profile_revisions (profile_id, status, created_at desc);

create table if not exists public.teacher_media (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null references public.teacher_profiles(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video', 'presentation', 'other')),
  title text,
  description text,
  storage_path text,
  public_url text,
  mime_type text,
  size_bytes bigint,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists teacher_media_profile_idx
  on public.teacher_media (profile_id, kind);

create table if not exists public.teacher_documents (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null references public.teacher_profiles(id) on delete cascade,
  kind text not null default 'document'
    check (kind in ('presentation', 'pdf', 'certificate', 'sample', 'document')),
  title text not null,
  description text,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists teacher_documents_profile_idx
  on public.teacher_documents (profile_id);

create table if not exists public.teacher_sync_logs (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null references public.teacher_profiles(id) on delete cascade,
  event text not null,
  request_id text,
  status text not null check (status in ('pending', 'success', 'failed')),
  http_status int,
  response_body text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists teacher_sync_logs_profile_idx
  on public.teacher_sync_logs (profile_id, created_at desc);

create table if not exists public.teacher_profile_audit_logs (
  id text primary key default gen_random_uuid()::text,
  profile_id text references public.teacher_profiles(id) on delete set null,
  actor_user_id text references public.users(id) on delete set null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists teacher_profile_audit_logs_profile_idx
  on public.teacher_profile_audit_logs (profile_id, created_at desc);

comment on table public.teacher_profiles is
  'Özel ders vitrin profili — tek kaynak (dersonlinevipkocluk). onlinevipdershane.com yalnızca published snapshot okur.';
