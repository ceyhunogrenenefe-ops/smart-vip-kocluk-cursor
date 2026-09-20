-- CRM temsilci vardiyaları (haftalık; gece yarısını geçen vardiya desteklenir) — yalnız ekleme
create table if not exists public.crm_agent_shifts (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  user_id text not null,
  day_of_week smallint not null check (day_of_week between 1 and 7), -- 1 = Pazartesi
  start_time time not null,
  end_time time not null,      -- end <= start ise ertesi güne taşar (ör. 22:00-02:00)
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists crm_agent_shifts_inst_idx on public.crm_agent_shifts (institution_id, day_of_week);
create index if not exists crm_agent_shifts_user_idx on public.crm_agent_shifts (user_id);
alter table public.crm_agent_shifts enable row level security;
