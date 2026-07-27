-- RUN IN SUPABASE SQL EDITOR (production)
-- Öğrenci aktiflik dönemleri — File: sql/2026-07-27-student-activity-periods.sql
-- Mevcut öğrenci ve rapor verilerini silmez.

create table if not exists public.student_activity_periods (
  id text primary key default gen_random_uuid()::text,
  student_id text not null references public.students(id) on delete cascade,
  coach_id text references public.coaches(id) on delete set null,
  start_date date not null,
  end_date date,
  status text not null default 'active'
    check (status in ('active', 'passive')),
  period_type text not null default 'custom'
    check (period_type in ('summer', 'school_year', 'custom')),
  passive_reason text,
  note text,
  created_by text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_activity_periods_dates_chk
    check (end_date is null or end_date >= start_date)
);

create index if not exists student_activity_periods_student_idx
  on public.student_activity_periods (student_id, start_date, end_date);

create index if not exists student_activity_periods_coach_idx
  on public.student_activity_periods (coach_id, status);

create table if not exists public.student_activity_audit_logs (
  id text primary key default gen_random_uuid()::text,
  student_id text not null references public.students(id) on delete cascade,
  period_id text references public.student_activity_periods(id) on delete set null,
  actor_user_id text references public.users(id) on delete set null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_activity_audit_student_idx
  on public.student_activity_audit_logs (student_id, created_at desc);

insert into public.student_activity_periods (
  student_id, coach_id, start_date, end_date, status, period_type, note, created_at, updated_at
)
select
  s.id,
  s.coach_id,
  coalesce((s.created_at at time zone 'Europe/Istanbul')::date, current_date),
  null,
  'active',
  'custom',
  'Sistem geçişi: varsayılan aktif dönem',
  now(),
  now()
from public.students s
where s.coach_id is not null
  and not exists (
    select 1 from public.student_activity_periods p where p.student_id = s.id
  );
