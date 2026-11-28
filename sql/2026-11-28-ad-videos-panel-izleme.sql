-- Reklam Videoları: ham video ile montajı ayırır, yorumları sürüme bağlar.
-- Mevcut görev ve eski teslim satırlarına dokunmaz; yalnız kolon ve tablo ekler.
-- Supabase SQL Editor'de bir kez çalıştırılır.

alter table public.ad_video_submissions
  add column if not exists kind text not null default 'raw';

alter table public.ad_video_submissions
  drop constraint if exists ad_video_submissions_kind_chk;
alter table public.ad_video_submissions
  add constraint ad_video_submissions_kind_chk check (kind in ('raw', 'edit'));

alter table public.ad_video_submissions
  add column if not exists open_for_comments boolean not null default false;
alter table public.ad_video_submissions
  add column if not exists opened_at timestamptz;
alter table public.ad_video_submissions
  add column if not exists opened_by text;
alter table public.ad_video_submissions
  add column if not exists preview_status text;
alter table public.ad_video_submissions
  add column if not exists preview_note text;

-- Sürüm numarası türe göredir: ham v1 ile montaj v1 aynı görevde durabilir.
alter table public.ad_video_submissions
  drop constraint if exists ad_video_submissions_task_id_version_key;
create unique index if not exists avs_task_kind_version
  on public.ad_video_submissions (task_id, kind, version);

alter table public.ad_video_upload_sessions
  add column if not exists kind text not null default 'raw';

alter table public.ad_video_tasks
  add column if not exists has_edit boolean not null default false;
alter table public.ad_video_tasks
  add column if not exists review_open boolean not null default false;
alter table public.ad_video_tasks
  add column if not exists last_edit_at timestamptz;
alter table public.ad_video_tasks
  add column if not exists approved_version integer;
alter table public.ad_video_tasks
  add column if not exists approved_kind text;

create table if not exists public.ad_video_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ad_video_submissions(id) on delete cascade,
  task_id uuid not null references public.ad_video_tasks(id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists avc_submission_idx on public.ad_video_comments (submission_id);

alter table public.ad_video_comments enable row level security;
