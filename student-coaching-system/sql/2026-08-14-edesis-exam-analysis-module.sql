-- Edesis sınav analizi ve öğrenci değerlendirme modülü
-- Mevcut exam_results / students / yoklama tablolarına dokunmaz.

create table if not exists public.edesis_sync_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running',
  source text not null default 'manual',
  fetched integer not null default 0,
  matched integer not null default 0,
  imported integer not null default 0,
  error_message text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_edesis_sync_logs_inst on public.edesis_sync_logs (institution_id, started_at desc);

create table if not exists public.edesis_student_mappings (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions (id) on delete set null,
  edesis_student_id text not null,
  platform_student_id text null references public.students (id) on delete set null,
  status text not null default 'pending',
  match_method text null,
  conflict_reason text null,
  edesis_name text null,
  edesis_email text null,
  school_no text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edesis_student_id)
);

create index if not exists idx_edesis_mappings_status on public.edesis_student_mappings (status);

create table if not exists public.student_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions (id) on delete set null,
  student_id text not null references public.students (id) on delete cascade,
  status text not null default 'draft',
  window_key text not null default 'last5',
  exam_family text null,
  exam_ids jsonb not null default '[]'::jsonb,
  auto_draft jsonb not null default '{}'::jsonb,
  sections jsonb not null default '{}'::jsonb,
  chart_payload jsonb not null default '{}'::jsonb,
  created_by text null,
  created_by_role text null,
  approved_by text null,
  published_at timestamptz null,
  shared_parent_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sar_student on public.student_analysis_reports (student_id, created_at desc)
  where deleted_at is null;

create table if not exists public.student_analysis_report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.student_analysis_reports (id) on delete cascade,
  version_no integer not null default 1,
  editor_id text null,
  editor_role text null,
  changed_fields jsonb not null default '[]'::jsonb,
  previous_sections jsonb null,
  sections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sarv_report on public.student_analysis_report_versions (report_id, version_no desc);

create table if not exists public.student_analysis_report_exams (
  report_id uuid not null references public.student_analysis_reports (id) on delete cascade,
  exam_id text not null,
  primary key (report_id, exam_id)
);

create table if not exists public.generated_exam_reports (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions (id) on delete set null,
  student_id text not null references public.students (id) on delete cascade,
  edesis_student_id text null,
  edesis_exam_id text null,
  term_id text null,
  report_code integer not null,
  report_label text null,
  exam_title text null,
  status text not null default 'processing',
  job_id text null,
  report_url text null,
  force_new boolean not null default false,
  created_by text null,
  viewed_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ger_student on public.generated_exam_reports (student_id, created_at desc)
  where deleted_at is null;

create table if not exists public.report_share_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions (id) on delete set null,
  student_id text not null references public.students (id) on delete cascade,
  generated_report_id uuid null references public.generated_exam_reports (id) on delete set null,
  sender_id text null,
  parent_name text null,
  parent_phone text null,
  report_type text null,
  message_body text null,
  report_url text null,
  delivery_status text not null default 'queued',
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rsl_student on public.report_share_logs (student_id, created_at desc);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  institution_id text null references public.institutions (id) on delete set null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz null,
  status text not null default 'received',
  error_message text null,
  created_at timestamptz not null default now(),
  unique (event_id)
);

create index if not exists idx_webhook_events_type on public.webhook_events (event_type, created_at desc);

create table if not exists public.edesis_topic_thresholds (
  institution_id text primary key references public.institutions (id) on delete cascade,
  bands jsonb not null default '[
    {"max":39,"level":"kritik","label":"Kritik"},
    {"max":59,"level":"gelistirilmeli","label":"Geliştirilmeli"},
    {"max":74,"level":"orta","label":"Orta"},
    {"max":89,"level":"iyi","label":"İyi"},
    {"max":100,"level":"cok_iyi","label":"Çok iyi"}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.student_analysis_reports is 'Koç/öğretmen Edesis değerlendirme raporları; soft delete.';
comment on table public.generated_exam_reports is 'Edesis 102/104/105 PDF arşivi.';
comment on table public.webhook_events is 'Edesis App.Exam.ResultsPublished idempotent olayları.';

create table if not exists public.edesis_connections (
  institution_id text primary key references public.institutions (id) on delete cascade,
  base_url text null,
  last_tested_at timestamptz null,
  last_ok boolean null,
  last_error text null,
  updated_at timestamptz not null default now()
);

comment on table public.edesis_connections is 'Edesis bağlantı durumu. API anahtarı burada tutulmaz; Vercel EDESIS_API_KEY.';
