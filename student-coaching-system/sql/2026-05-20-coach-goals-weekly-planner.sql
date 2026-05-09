-- Koçun haftalık hedef kartları + öğrencinin zaman çizelgesine yerleştirdiği bloklar

create table if not exists public.coach_weekly_goals (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  coach_id text references public.coaches (id) on delete set null,
  institution_id text references public.institutions (id) on delete set null,
  subject text not null default '',
  title text not null default '',
  target_quantity numeric not null default 0 check (target_quantity >= 0),
  week_start_date date not null,
  quantity_unit text not null default 'soru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_weekly_goals_student_week_idx
  on public.coach_weekly_goals (student_id, week_start_date);

create table if not exists public.weekly_planner_entries (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  institution_id text references public.institutions (id) on delete set null,
  coach_goal_id text references public.coach_weekly_goals (id) on delete set null,
  subject text not null default '',
  title text not null default '',
  planned_quantity numeric not null default 0 check (planned_quantity >= 0),
  completed_quantity numeric not null default 0 check (completed_quantity >= 0),
  planner_date date not null,
  start_time text not null,
  end_time text not null,
  status text not null default 'planned'
    check (status in ('planned', 'completed', 'partial', 'missed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weekly_planner_entries_student_date_idx
  on public.weekly_planner_entries (student_id, planner_date);

create index if not exists weekly_planner_entries_goal_idx
  on public.weekly_planner_entries (coach_goal_id);

comment on table public.coach_weekly_goals is 'Koç öğrenciye haftalık hedef miktarını (ör. 100 soru) bağlar.';
comment on table public.weekly_planner_entries is 'Öğrenci takvimde saat bloklarına yerleştirdiği görevler; coach_goal ile hedef takibi.';
comment on column public.weekly_planner_entries.planner_date is 'Yer aldığı yerel takvim günü';
comment on column public.weekly_planner_entries.start_time is 'Başlangıç HH:mm (örn 18:00)';
comment on column public.weekly_planner_entries.end_time is 'Bitiş HH:mm (çoğu örnek için saat sonra, örn 19:00)';

-- Gerçek zamanlı: Dashboard → Replication → weekly_planner_entries + coach_weekly_goals işaretleyebilirsiniz.
-- JWT tabanlı uygulamada güvenli RLS karmaşık; veri işlemi /api ile service role yapılır.
alter publication supabase_realtime add table public.weekly_planner_entries;
alter publication supabase_realtime add table public.coach_weekly_goals;
