-- Video Soru Çözüm Merkezi (Aşama 2)
-- Yalnızca yeni tablolar. Mevcut ders / sınav / kullanıcı tablolarına dokunmaz.
-- Erişim: Vercel API (service role). RLS açık, policy yok → doğrudan istemci erişimi kapalı.

-- ---------------------------------------------------------------------------
-- Çalışmalar (set): karekod /c/{slug} kalıcı adres
-- ---------------------------------------------------------------------------
create table if not exists public.video_solution_sets (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  slug text not null,
  school_year text not null,
  grade_level smallint not null,
  subject text not null,
  term smallint,
  exam_number smallint,
  work_type text not null default 'genel',
  title text not null,
  description text,
  status text not null default 'draft',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_solution_sets_slug_uniq unique (slug),
  constraint video_solution_sets_grade_chk check (grade_level between 3 and 12),
  constraint video_solution_sets_term_chk check (term is null or term in (1, 2)),
  constraint video_solution_sets_exam_chk check (exam_number is null or exam_number in (1, 2)),
  constraint video_solution_sets_work_type_chk check (
    work_type in ('yazili', 'deneme', 'konu_tarama', 'foy', 'odev', 'genel')
  ),
  constraint video_solution_sets_status_chk check (status in ('draft', 'published', 'archived')),
  constraint video_solution_sets_slug_format_chk check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 120
  )
);

create index if not exists video_solution_sets_institution_status_idx
  on public.video_solution_sets (institution_id, status);

create index if not exists video_solution_sets_lookup_idx
  on public.video_solution_sets (grade_level, subject, term, exam_number);

comment on table public.video_solution_sets is
  'Video çözüm merkezi — çalışma / sınav paketi; slug karekod URL''inde sabit kalır';
comment on column public.video_solution_sets.slug is
  'Kalıcı public yol: /c/{slug}. Yayınlandıktan sonra uygulama tarafında değiştirilmemeli.';

-- ---------------------------------------------------------------------------
-- Sorular: set içinde numaralı; video_id güncellenebilir, slug değişmez
-- ---------------------------------------------------------------------------
create table if not exists public.video_solution_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.video_solution_sets (id) on delete cascade,
  question_number integer not null,
  title text,
  topic text,
  video_provider text not null default 'youtube',
  video_ref text,
  youtube_video_id text,
  youtube_url text,
  teacher_user_id text,
  image_storage_path text,
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_solution_questions_set_num_uniq unique (set_id, question_number),
  constraint video_solution_questions_number_chk check (question_number >= 1),
  constraint video_solution_questions_status_chk check (status in ('draft', 'published')),
  constraint video_solution_questions_provider_chk check (
    video_provider in ('youtube', 'vimeo', 'google_drive', 'external')
  ),
  constraint video_solution_questions_ref_chk check (
    char_length(trim(coalesce(video_ref, youtube_video_id, ''))) >= 3
    or char_length(trim(coalesce(youtube_url, ''))) >= 8
  )
);

create index if not exists video_solution_questions_set_sort_idx
  on public.video_solution_questions (set_id, sort_order, question_number);

create index if not exists video_solution_questions_teacher_idx
  on public.video_solution_questions (teacher_user_id)
  where teacher_user_id is not null;

comment on table public.video_solution_questions is
  'Çalışma başına soru ve YouTube video kimliği; public /c/{slug}/s/{n} ile n=question_number';

-- ---------------------------------------------------------------------------
-- RLS: API service role kullanır
-- ---------------------------------------------------------------------------
alter table public.video_solution_sets enable row level security;
alter table public.video_solution_questions enable row level security;

-- ---------------------------------------------------------------------------
-- Geri alma (manuel, gerektiğinde):
-- drop table if exists public.video_solution_questions cascade;
-- drop table if exists public.video_solution_sets cascade;
-- ---------------------------------------------------------------------------
