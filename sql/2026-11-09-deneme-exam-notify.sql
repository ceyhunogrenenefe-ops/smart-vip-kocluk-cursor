-- Deneme Kulübü sınav bildirimleri (CRM → Etkinlik Formları)
-- Takvim satırında saat yoksa otomasyon ayarındaki varsayılan saat kullanılır.

alter table public.exam_calendar add column if not exists exam_time text;

create table if not exists public.deneme_exam_notify_settings (
  institution_id text primary key,
  enabled boolean not null default false,
  day_before_enabled boolean not null default true,
  soon_enabled boolean not null default true,
  karne_enabled boolean not null default true,
  day_before_time text not null default '18:00',
  default_exam_time text not null default '10:00',
  tpl_day_before text not null default '',
  tpl_soon text not null default '',
  tpl_karne text not null default '',
  test_phone text,
  updated_at timestamptz not null default now()
);

create table if not exists public.deneme_exam_notify_targets (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  kind text not null check (kind in ('student', 'class', 'grade')),
  student_id text,
  class_id text,
  grade_level text,
  created_at timestamptz not null default now()
);

create index if not exists deneme_exam_notify_targets_inst_idx
  on public.deneme_exam_notify_targets (institution_id);

create table if not exists public.deneme_exam_notify_sends (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  exam_id text not null,
  student_id text not null,
  step text not null check (step in ('day_before', 'soon', 'karne')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  scheduled_for timestamptz,
  phone text,
  error text,
  sent_at timestamptz,
  karne_token text,
  result_id text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, exam_id, student_id, step)
);

create unique index if not exists deneme_exam_notify_sends_token_idx
  on public.deneme_exam_notify_sends (karne_token)
  where karne_token is not null;

create index if not exists deneme_exam_notify_sends_due_idx
  on public.deneme_exam_notify_sends (institution_id, status, scheduled_for);

alter table public.deneme_exam_notify_settings enable row level security;
alter table public.deneme_exam_notify_targets enable row level security;
alter table public.deneme_exam_notify_sends enable row level security;

notify pgrst, 'reload schema';
