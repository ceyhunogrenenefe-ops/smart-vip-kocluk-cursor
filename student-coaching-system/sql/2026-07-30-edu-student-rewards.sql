-- EduPanel: öğrenci birikimli ödüller (altın, gümüş, seviye)
create table if not exists public.edu_student_rewards (
  id uuid primary key default gen_random_uuid(),
  student_user_id text not null unique,
  student_id text references public.students(id) on delete set null,
  gold integer not null default 0 check (gold >= 0),
  silver integer not null default 0 check (silver >= 0),
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_edu_student_rewards_student
  on public.edu_student_rewards(student_user_id);

alter table public.edu_student_rewards enable row level security;

comment on table public.edu_student_rewards is
  'EduPanel öğrenci birikimli ödülleri — altın/gümüş ve seviye (API service role).';
