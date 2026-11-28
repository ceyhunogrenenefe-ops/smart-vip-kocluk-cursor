-- Reklam videoları: görev, kurum arşivi sürümleri, montaj yorumları, kurgu ekibi.
-- Eski kişisel Drive bağlantısı görevde metin olarak kalır; arşiv dosyası sayılmaz.
-- Supabase SQL Editor'de bir kez çalıştırın (idempotent).
-- users.id ve institutions.id bu projede TEXT.

create table if not exists public.ad_video_tasks (
  id text primary key default gen_random_uuid()::text,
  institution_id text not null,
  teacher_user_id text not null,
  teacher_name text not null default '',
  idea text not null default '',
  theme text not null default '',
  shoot_notes text not null default '',
  planned_shoot_date date,
  planned_shoot_time text,
  due_at timestamptz,
  actual_shoot_date date,
  status text not null default 'planlandi',
  legacy_drive_url text,
  revision_note text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_video_tasks_status_chk check (
    status in ('planlandi', 'ham_teslim', 'montaj_taslak', 'incelemede', 'revizyon_istendi', 'onaylandi')
  )
);

create index if not exists idx_ad_video_tasks_institution
  on public.ad_video_tasks (institution_id, updated_at desc);

create table if not exists public.ad_video_files (
  id text primary key default gen_random_uuid()::text,
  task_id text not null references public.ad_video_tasks(id) on delete cascade,
  institution_id text not null,
  kind text not null,
  version integer not null,
  source text not null default 'archive',
  drive_file_id text,
  mime_type text,
  original_name text,
  size_bytes bigint,
  uploader_user_id text,
  uploaded_at timestamptz,
  status text not null default 'uploading',
  preview_status text not null default 'pending',
  preview_drive_file_id text,
  preview_note text,
  open_for_comments boolean not null default false,
  review_opened_at timestamptz,
  review_opened_by text,
  approved_at timestamptz,
  approved_by text,
  approved_by_name text,
  is_current_approval boolean not null default false,
  client_upload_id text,
  session_uri text,
  created_at timestamptz not null default now(),
  constraint ad_video_files_kind_chk check (kind in ('raw', 'edit')),
  constraint ad_video_files_source_chk check (source in ('archive', 'legacy_link')),
  constraint ad_video_files_status_chk check (status in ('uploading', 'stored', 'failed'))
);

create unique index if not exists uq_ad_video_files_client_upload
  on public.ad_video_files (task_id, client_upload_id)
  where client_upload_id is not null;

create index if not exists idx_ad_video_files_task
  on public.ad_video_files (task_id, kind, version);

create table if not exists public.ad_video_comments (
  id text primary key default gen_random_uuid()::text,
  file_id text not null references public.ad_video_files(id) on delete cascade,
  task_id text not null,
  institution_id text not null,
  author_user_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_video_comments_file
  on public.ad_video_comments (file_id, created_at);

create table if not exists public.ad_video_editors (
  institution_id text not null,
  user_id text not null,
  user_name text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  primary key (institution_id, user_id)
);

alter table public.ad_video_tasks enable row level security;
alter table public.ad_video_files enable row level security;
alter table public.ad_video_comments enable row level security;
alter table public.ad_video_editors enable row level security;

comment on table public.ad_video_tasks is
  'Reklam video görevleri. legacy_drive_url eski kişisel bağlantıdır, kurum arşivi değildir.';
comment on column public.ad_video_files.session_uri is
  'Google devam ettirilebilir yükleme adresi. İstemciye verilmez.';

notify pgrst, 'reload schema';
