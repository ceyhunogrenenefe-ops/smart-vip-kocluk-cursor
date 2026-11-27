-- Reklam Videoları modülü — yalnız YENİ tablolar ekler.
-- Mevcut kullanıcı, ders ve bildirim tablolarına dokunulmaz.
-- Kimlik kolonları (teacher_id, institution_id, *_by) bu veritabanındaki
-- users.id / institutions.id ile aynı biçimde TEXT tutulur.
--
-- Supabase SQL Editor'de bir kez çalıştırılır; tekrar çalıştırmak güvenlidir.

create table if not exists public.ad_video_tasks (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  teacher_id text not null,
  -- Birden fazla öğretmene aynı anda atanan görevleri gruplar (her öğretmene ayrı satır)
  batch_id uuid,
  title text not null,
  idea text,
  theme text,
  shoot_note text,
  reference_url text,
  planned_shoot_at timestamptz,
  due_at timestamptz,
  -- Öğretmenin "Çektim" ile kaydettiği gerçek çekim günü
  actual_shoot_date date,
  actual_shoot_recorded_at timestamptz,
  status text not null default 'planned'
    check (status in ('planned','shot','submitted','revision_requested','approved')),
  -- Sistem tarafından yazılır: ilk başarılı teslim ve son yükleme
  first_submitted_at timestamptz,
  last_uploaded_at timestamptz,
  current_submission_id uuid,
  approved_at timestamptz,
  approved_by text,
  review_note text,
  review_note_at timestamptz,
  review_note_by text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists avt_teacher_idx on public.ad_video_tasks (teacher_id);
create index if not exists avt_institution_idx on public.ad_video_tasks (institution_id);
create index if not exists avt_status_idx on public.ad_video_tasks (status);
create index if not exists avt_due_idx on public.ad_video_tasks (due_at);
create index if not exists avt_planned_idx on public.ad_video_tasks (planned_shoot_at);

-- Her yükleme bir teslim sürümüdür; düzeltmeler yeni sürüm olarak eklenir,
-- eskiler silinmez (geçmiş).
create table if not exists public.ad_video_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ad_video_tasks(id) on delete cascade,
  teacher_id text not null,
  version integer not null,
  source text not null check (source in ('drive_upload','drive_link')),
  drive_file_id text,
  drive_url text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  is_revision boolean not null default false,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','revision_requested','superseded')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (task_id, version)
);
create index if not exists avs_task_idx on public.ad_video_submissions (task_id);

-- Görev geçmişi (atama, çekim kaydı, teslim, inceleme)
create table if not exists public.ad_video_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ad_video_tasks(id) on delete cascade,
  actor_id text,
  kind text not null,
  note text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ave_task_idx on public.ad_video_events (task_id);

-- Drive'a doğrudan (resumable) yükleme oturumları — kesintide devam için
create table if not exists public.ad_video_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ad_video_tasks(id) on delete cascade,
  teacher_id text not null,
  session_uri text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  drive_file_id text,
  completed_at timestamptz,
  submission_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists avus_task_idx on public.ad_video_upload_sessions (task_id);

-- Aynı olay için ikinci bildirimi engeller (event_key + alıcı tekil)
create table if not exists public.ad_video_notification_log (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  recipient_id text not null,
  task_id uuid,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (event_key, recipient_id)
);

-- Kurum başına ayar (institution_id boşsa '' = genel)
create table if not exists public.ad_video_settings (
  institution_id text primary key,
  editor_user_ids text[] not null default '{}',
  drive_upload_enabled boolean not null default false,
  drive_shared_drive_id text,
  drive_folder_id text,
  link_folder_url text,
  daily_summary_enabled boolean not null default true,
  daily_summary_time text not null default '18:00'
    check (daily_summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- ISO hafta günü: 1 = Pazartesi … 7 = Pazar
  daily_summary_days integer[] not null default '{1,2,3,4,5}',
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Sunucu yalnız service role ile erişir; istemciye doğrudan açılmaz.
alter table public.ad_video_tasks enable row level security;
alter table public.ad_video_submissions enable row level security;
alter table public.ad_video_events enable row level security;
alter table public.ad_video_upload_sessions enable row level security;
alter table public.ad_video_notification_log enable row level security;
alter table public.ad_video_settings enable row level security;
