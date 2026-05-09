-- Öğrenci günlük ekran süresi (dakika); takvim haftası ile birlikte raporlanır

create table if not exists public.student_screen_time_logs (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  institution_id text references public.institutions (id) on delete set null,
  log_date date not null,
  screen_minutes integer not null default 0 check (screen_minutes >= 0 and screen_minutes <= 1440),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, log_date)
);

create index if not exists student_screen_time_logs_student_date_idx
  on public.student_screen_time_logs (student_id, log_date desc);

comment on table public.student_screen_time_logs is 'Öğrencinin günlük uygulama/ekran süresi (dakika); kendi raporlar.';
comment on column public.student_screen_time_logs.screen_minutes is 'Gün içi toplam dakika (0–1440)';
