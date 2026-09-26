-- Otomatik Karşılama ve Lead Toplama modülü (2026-09-26) — üretimde uygulandı.
-- Yalnız YENİ tablolar eklenir; mevcut tablolara dokunulmaz, veri silinmez.
-- Modül varsayılan KAPALI gelir.

create table if not exists public.crm_auto_greeting_settings (
  institution_id text primary key references public.institutions(id) on delete cascade,
  is_active boolean not null default false,
  channel_whatsapp boolean not null default true,
  channel_instagram boolean not null default true,
  channel_facebook boolean not null default true,
  run_mode text not null default 'after_hours',
  business_start time not null default '09:00',
  business_end time not null default '22:00',
  custom_start time,
  custom_end time,
  greeting_text text,
  call_time_text text,
  closing_text text,
  call_slots jsonb not null default '["10:00 - 12:00","12:00 - 14:00","14:00 - 16:00","16:00 - 18:00","18:00 - 20:00"]'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.crm_auto_greeting_settings enable row level security;

create table if not exists public.crm_auto_greeting_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  institution_id text,
  lead_id uuid,
  channel text not null,
  step text not null default 'greeted',
  grade_program text,
  call_slot text,
  call_date date,
  human_takeover_at timestamptz,
  stopped_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_auto_greeting_sessions_conv_key
    on public.crm_auto_greeting_sessions (conversation_id);
alter table public.crm_auto_greeting_sessions enable row level security;

create table if not exists public.crm_auto_greeting_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  conversation_id uuid,
  lead_id uuid,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_auto_greeting_logs_inst_idx
    on public.crm_auto_greeting_logs (institution_id, created_at desc);
alter table public.crm_auto_greeting_logs enable row level security;
