-- Günlük çalışma kaydı (weekly_entries) ile takvim bloklarını eşlemek için
alter table public.weekly_planner_entries
  add column if not exists weekly_entry_id text references public.weekly_entries (id) on delete cascade;

create unique index if not exists weekly_planner_entries_weekly_entry_id_key
  on public.weekly_planner_entries (weekly_entry_id)
  where weekly_entry_id is not null;

comment on column public.weekly_planner_entries.weekly_entry_id is 'weekly_entries satırından otomatik üretilen blok; günlük kayıt silinince CASCADE ile silinir.';
