-- Widget başına temsilci. Temsilciler ekranı bu tablodaki kişileri gösterir.
create table if not exists public.crm_widget_agents (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  widget_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  created_by text null,
  created_at timestamptz not null default now(),
  unique (institution_id, widget_id, user_id)
);

create index if not exists crm_widget_agents_inst_idx
  on public.crm_widget_agents (institution_id, widget_id);

alter table public.crm_settings
  add column if not exists widget_agents_seeded boolean not null default false;

comment on table public.crm_widget_agents is
  'Widgetlere eklenen CRM temsilcileri. Temsilciler listesi bu kadroyu kullanır.';
