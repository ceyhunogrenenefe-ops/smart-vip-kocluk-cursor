-- Animasyon Havuzu — kurum geneli paylaşımlı HTML animasyon kütüphanesi
create extension if not exists pgcrypto;

create table if not exists public.edu_animation_pool (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid,
  teacher_user_id text not null,
  title text not null,
  program text not null check (program in ('lgs', 'tyt', 'ayt')),
  class_level text not null,
  subject_name text not null,
  topic_name text not null,
  original_name text not null,
  storage_path text not null,
  file_size integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_edu_animation_pool_institution on public.edu_animation_pool(institution_id);
create index if not exists idx_edu_animation_pool_program on public.edu_animation_pool(program, class_level, subject_name);
create index if not exists idx_edu_animation_pool_teacher on public.edu_animation_pool(teacher_user_id);

alter table public.edu_animations
  add column if not exists pool_id uuid references public.edu_animation_pool(id) on delete set null;

create index if not exists idx_edu_animations_pool on public.edu_animations(pool_id);

alter table public.edu_homework
  add column if not exists pool_animation_id uuid references public.edu_animation_pool(id) on delete set null;

create index if not exists idx_edu_homework_pool_anim on public.edu_homework(pool_animation_id);

drop trigger if exists trg_edu_animation_pool_updated on public.edu_animation_pool;
create trigger trg_edu_animation_pool_updated
  before update on public.edu_animation_pool
  for each row execute function public.edu_touch_updated_at();
