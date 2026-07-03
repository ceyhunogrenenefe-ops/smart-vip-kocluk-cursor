-- EduPanel: öğrenci konu ilerlemesi, ödev %, animasyon, rozet puanı
create table if not exists public.edu_lesson_row_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_row_id uuid not null references public.edu_lesson_rows(id) on delete cascade,
  student_user_id text not null,
  student_id text references public.students(id) on delete set null,
  animation_completed boolean not null default false,
  animation_completed_at timestamptz,
  homework_percent integer not null default 0
    check (homework_percent >= 0 and homework_percent <= 100),
  topic_completed boolean not null default false,
  topic_completed_at timestamptz,
  points integer not null default 0
    check (points >= 0 and points <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_row_id, student_user_id)
);

create index if not exists idx_edu_lesson_row_progress_row
  on public.edu_lesson_row_progress(lesson_row_id);

create index if not exists idx_edu_lesson_row_progress_student
  on public.edu_lesson_row_progress(student_user_id);

alter table public.edu_lesson_row_progress enable row level security;

comment on table public.edu_lesson_row_progress is
  'EduPanel öğrenci ilerlemesi — animasyon, ödev yüzdesi, konu tamamlama, rozet puanı (API service role).';
