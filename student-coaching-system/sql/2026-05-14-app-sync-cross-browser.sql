-- Tarayıcılar arası senkron: deneme (exam_results + app_payload), okuma günlüğü, AI önerileri, yazılı ders şablonları
-- Supabase SQL Editor veya migration ile çalıştırın.
-- Not: Bazı projelerde `exam_results` hiç yoktu; önce tablo oluşturulur, eski kurulumlarda yalnızca kolon eklenir.

create table if not exists public.exam_results (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  exam_name text not null,
  date date,
  raw_score numeric,
  net_score numeric,
  correct integer not null default 0,
  wrong integer not null default 0,
  blank integer not null default 0,
  total_questions integer,
  institution_id text references public.institutions (id) on delete set null,
  app_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exam_results_student on public.exam_results (student_id);

comment on table public.exam_results is 'Deneme sınavı sonuçları; app_payload tam ExamResult JSON (ders bazlı netler).';

alter table public.exam_results
  add column if not exists app_payload jsonb;

comment on column public.exam_results.app_payload is 'Uygulama ExamResult JSON (ders bazlı netler); legacy satırlar null olabilir.';

create table if not exists public.reading_logs (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  book_id text null,
  date date not null,
  minutes_read integer not null default 0,
  pages_read integer null,
  notes text null,
  institution_id text null references public.institutions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reading_logs_student on public.reading_logs (student_id);

comment on table public.reading_logs is 'Kitap okuma günlüğü (BookTracking); tarayıcı localStorage yerine DB.';

create table if not exists public.ai_coach_suggestions (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  institution_id text null references public.institutions (id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_coach_suggestions_student on public.ai_coach_suggestions (student_id);

comment on table public.ai_coach_suggestions is 'AI Koç önerileri (AICoachSuggestion JSON payload).';

create table if not exists public.institution_written_exam_prefs (
  institution_id text primary key references public.institutions (id) on delete cascade,
  global_subjects jsonb not null default '[]'::jsonb,
  per_student_subjects jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.institution_written_exam_prefs is 'Kurum bazlı yazılı ders listesi şablonları (global + öğrenci başına).';
