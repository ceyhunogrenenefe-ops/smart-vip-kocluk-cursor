-- Grup canlı ders: "Nerede Kaldım?" konu / kitap / sayfa kayıtları
create extension if not exists pgcrypto;

create table if not exists public.class_lesson_topic_checkpoints (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid references public.class_sessions(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  institution_id uuid null,
  teacher_id text not null references public.users(id) on delete cascade,
  subject text not null,
  lesson_date date not null,
  class_label text null,
  topic text not null,
  sub_topic text null,
  book_name text null,
  page_number text null,
  note text null,
  created_by text null references public.users(id) on delete set null,
  updated_by text null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cltc_class_subject_date
  on public.class_lesson_topic_checkpoints (class_id, subject, lesson_date desc);

create index if not exists idx_cltc_teacher_date
  on public.class_lesson_topic_checkpoints (teacher_id, lesson_date desc);

create index if not exists idx_cltc_session
  on public.class_lesson_topic_checkpoints (class_session_id)
  where class_session_id is not null;

create unique index if not exists uq_cltc_session_id
  on public.class_lesson_topic_checkpoints (class_session_id)
  where class_session_id is not null;

alter table public.class_lesson_topic_checkpoints enable row level security;

comment on table public.class_lesson_topic_checkpoints is
  'Grup canlı ders konu takibi — öğretmenin kaldığı konu, alt konu, kitap ve sayfa (API service role).';

notify pgrst, 'reload schema';
