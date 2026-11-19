-- AI Satış Asistanı (2026-11-19)
-- Yalnız YENİ tablolar eklenir; mevcut tablolara dokunulmaz, veri silinmez.
-- Modül varsayılan KAPALI gelir: yönetici panelden açmadan tek mesaj gitmez.
-- Supabase SQL Editor'da bir kez çalıştırın (tekrar çalıştırmak güvenli).

create table if not exists public.crm_ai_assistant_settings (
  institution_id text primary key,
  is_active boolean not null default false,
  channel_whatsapp boolean not null default true,
  channel_instagram boolean not null default true,
  -- true: yalnız ana Instagram hesabına (ör. @onlinevipdershane) gelen DM'ler yanıtlanır
  primary_ig_only boolean not null default true,
  -- {"1":[{"start":"00:00","end":"09:00"},{"start":"19:00","end":"24:00"}], ... "7":[...]}  (1 = Pazartesi, İstanbul saati)
  schedule jsonb not null default '{
    "1":[{"start":"00:00","end":"09:00"},{"start":"19:00","end":"24:00"}],
    "2":[{"start":"00:00","end":"09:00"},{"start":"19:00","end":"24:00"}],
    "3":[{"start":"00:00","end":"09:00"},{"start":"19:00","end":"24:00"}],
    "4":[{"start":"00:00","end":"09:00"},{"start":"19:00","end":"24:00"}],
    "5":[{"start":"00:00","end":"09:00"},{"start":"19:00","end":"24:00"}],
    "6":[{"start":"00:00","end":"24:00"}],
    "7":[{"start":"00:00","end":"24:00"}]
  }'::jsonb,
  model text not null default 'claude-opus-5-5',
  effort text not null default 'medium',
  kvkk_url text,
  site_urls jsonb not null default '[]'::jsonb,
  -- Arama ekibi: boşsa vardiyası olan herkes
  consultant_user_ids jsonb not null default '[]'::jsonb,
  slot_minutes integer not null default 30,
  days_ahead integer not null default 3,
  min_lead_minutes integer not null default 60,
  max_bot_replies integer not null default 15,
  debounce_seconds integer not null default 8,
  extra_instructions text,
  tone_guide text,
  tone_guide_updated_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.crm_ai_assistant_settings enable row level security;

create table if not exists public.crm_ai_kb_pages (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  url text not null,
  title text,
  content text,
  content_hash text,
  status text not null default 'ok',
  error text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists crm_ai_kb_pages_inst_url_key
    on public.crm_ai_kb_pages (institution_id, url);
alter table public.crm_ai_kb_pages enable row level security;

create table if not exists public.crm_ai_tone_sources (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  file_name text,
  source_kind text,
  message_count integer not null default 0,
  -- Telefon / e-posta maskelenmiş örnek diyaloglar (müşteri adı yerine "Müşteri")
  excerpt text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists crm_ai_tone_sources_inst_idx
    on public.crm_ai_tone_sources (institution_id, created_at desc);
alter table public.crm_ai_tone_sources enable row level security;

create table if not exists public.crm_ai_sessions (
  conversation_id uuid primary key references public.crm_conversations(id) on delete cascade,
  institution_id text,
  lead_id uuid,
  channel text not null,
  -- active | handover | completed
  state text not null default 'active',
  collected jsonb not null default '{}'::jsonb,
  summary text,
  bot_reply_count integer not null default 0,
  pending_at timestamptz,
  processing_at timestamptz,
  last_processed_at timestamptz,
  kvkk_notice_sent_at timestamptz,
  handover_at timestamptz,
  handover_reason text,
  handover_by text,
  appointment_task_id uuid,
  appointment_at timestamptz,
  appointment_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_ai_sessions_pending_idx
    on public.crm_ai_sessions (pending_at) where pending_at is not null;
alter table public.crm_ai_sessions enable row level security;

create table if not exists public.crm_ai_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  conversation_id uuid,
  lead_id uuid,
  event text not null,
  detail jsonb,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists crm_ai_logs_inst_idx
    on public.crm_ai_logs (institution_id, created_at desc);
alter table public.crm_ai_logs enable row level security;
