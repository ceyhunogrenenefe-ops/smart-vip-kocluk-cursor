-- YÖS native integration schema (non-breaking additions)

create table if not exists public.programs (
  id text primary key,
  name text not null unique check (name in ('ilkokul', 'lgs', 'tyt', 'ayt', 'yos')),
  created_at timestamptz not null default now()
);

insert into public.programs (id, name) values
  ('ilkokul', 'ilkokul'),
  ('lgs', 'lgs'),
  ('tyt', 'tyt'),
  ('ayt', 'ayt'),
  ('yos', 'yos')
on conflict (id) do nothing;

alter table public.students
  add column if not exists program_id text references public.programs(id);

update public.students
set program_id = case
  when class_level = 'LGS' then 'lgs'
  when class_level = 'YOS' then 'yos'
  when class_level like 'YKS-%' then 'ayt'
  when class_level ~ '^[0-9]+$' and class_level::int between 3 and 7 then 'ilkokul'
  when class_level ~ '^[0-9]+$' and class_level::int between 9 and 12 then 'tyt'
  else coalesce(program_id, 'ilkokul')
end
where program_id is null;

create table if not exists public.subjects (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.subjects (id, name) values
  ('yos_matematik', 'matematik'),
  ('yos_geometri', 'geometri'),
  ('yos_iq', 'iq')
on conflict (id) do nothing;

alter table public.topics
  add column if not exists subject_id text references public.subjects(id),
  add column if not exists program_id text references public.programs(id);

create index if not exists idx_topics_subject_program
  on public.topics(subject_id, program_id);

create table if not exists public.student_topic_progress (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  topic_id text not null references public.topics(id) on delete cascade,
  solved_questions integer not null default 0,
  correct integer not null default 0,
  wrong integer not null default 0,
  success_rate numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_student_topic_progress_unique
  on public.student_topic_progress(student_id, topic_id);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  program_id text not null references public.programs(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_exams_program_name
  on public.exams(program_id, name);

create table if not exists public.exam_results_v2 (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  math_correct integer not null default 0,
  geometry_correct integer not null default 0,
  iq_correct integer not null default 0,
  total_score numeric(8,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_details (
  student_id text primary key references public.students(id) on delete cascade,
  dikkat_hatasi integer not null default 0,
  islem_hatasi integer not null default 0,
  zaman_yonetimi integer not null default 0,
  gorsel_okuma_hatasi integer not null default 0,
  updated_at timestamptz not null default now()
);
