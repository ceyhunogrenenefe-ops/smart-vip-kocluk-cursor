-- FAZ 3: takip planı görevleri (yalnız ekleme)
alter table public.registration_tasks
  add column if not exists auto_generated boolean not null default false,
  add column if not exists follow_up_stage text,
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason text;

create index if not exists registration_tasks_lead_open_idx
  on public.registration_tasks (lead_id, status)
  where status in ('pending', 'in_progress', 'overdue');
