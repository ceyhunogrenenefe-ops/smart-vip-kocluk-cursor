-- CRM günlük rapor arşivi + toplu mesaj kampanyaları + teslimat durumu
-- Supabase SQL Editor'da çalıştırılabilir (idempotent).

create table if not exists public.crm_bulk_campaigns (
  id uuid primary key,
  institution_id text not null,
  created_by text,
  template_name text,
  channel text not null default 'whatsapp',
  filters jsonb,
  planned_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists crm_bulk_campaigns_inst_created_idx
  on public.crm_bulk_campaigns (institution_id, created_at desc);
alter table public.crm_bulk_campaigns enable row level security;

alter table public.registration_channel_messages
  add column if not exists campaign_id uuid,
  add column if not exists delivery_status text,
  add column if not exists delivery_error text,
  add column if not exists delivery_updated_at timestamptz;

create index if not exists registration_channel_messages_campaign_idx
  on public.registration_channel_messages (campaign_id)
  where campaign_id is not null;
create index if not exists registration_channel_messages_external_id_idx
  on public.registration_channel_messages (external_message_id)
  where external_message_id is not null;

create table if not exists public.crm_daily_reports (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  report_date date not null,
  payload jsonb not null,
  message text,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  delivery jsonb,
  unique (institution_id, report_date)
);
alter table public.crm_daily_reports enable row level security;
