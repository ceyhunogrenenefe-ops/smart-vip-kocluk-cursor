-- EduPanel — ders satırı, HTML animasyon, ödev teslimi (Smart Koçluk entegrasyonu)
create extension if not exists pgcrypto;

create table if not exists public.edu_lesson_rows (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id text not null,
  institution_id uuid,
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  subject_name text not null,
  subject_color text not null default 'blue'
    check (subject_color in ('blue','green','amber','red','purple','pink','gray')),
  lesson_date date not null,
  status text not null default 'draft'
    check (status in ('draft','active','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_edu_lesson_rows_class on public.edu_lesson_rows(class_id);
create index if not exists idx_edu_lesson_rows_teacher on public.edu_lesson_rows(teacher_user_id);
create index if not exists idx_edu_lesson_rows_institution on public.edu_lesson_rows(institution_id);

create table if not exists public.edu_animations (
  id uuid primary key default gen_random_uuid(),
  lesson_row_id uuid not null references public.edu_lesson_rows(id) on delete cascade,
  original_name text not null,
  storage_path text not null,
  file_size integer not null default 0,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_edu_animations_lesson on public.edu_animations(lesson_row_id);

create table if not exists public.edu_homework (
  id uuid primary key default gen_random_uuid(),
  lesson_row_id uuid not null references public.edu_lesson_rows(id) on delete cascade,
  title text not null,
  book_name text,
  question_range text,
  description text,
  due_date date,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_edu_homework_lesson on public.edu_homework(lesson_row_id);

create table if not exists public.edu_homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.edu_homework(id) on delete cascade,
  student_user_id text not null,
  student_id text references public.students(id) on delete set null,
  storage_path text not null,
  submitted_at timestamptz not null default now(),
  teacher_note text,
  grade text,
  status text not null default 'submitted'
    check (status in ('submitted','reviewed','returned')),
  unique (homework_id, student_user_id)
);

create index if not exists idx_edu_submissions_homework on public.edu_homework_submissions(homework_id);

create or replace function public.edu_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_edu_lesson_rows_updated on public.edu_lesson_rows;
create trigger trg_edu_lesson_rows_updated
  before update on public.edu_lesson_rows
  for each row execute function public.edu_touch_updated_at();

drop trigger if exists trg_edu_homework_updated on public.edu_homework;
create trigger trg_edu_homework_updated
  before update on public.edu_homework
  for each row execute function public.edu_touch_updated_at();

alter table public.edu_lesson_rows enable row level security;
alter table public.edu_animations enable row level security;
alter table public.edu_homework enable row level security;
alter table public.edu_homework_submissions enable row level security;

comment on table public.edu_lesson_rows is 'EduPanel ders satırları — API service role ile yönetilir.';

-- Supabase Dashboard → Storage: public bucket oluşturun:
--   edu-animations (HTML dosyaları)
--   edu-homework-submissions (öğrenci fotoğraf teslimleri)
