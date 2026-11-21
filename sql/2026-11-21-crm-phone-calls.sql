-- Netgsm Netsantral telefon aramaları (handlers/netgsm-call-webhook.js)
-- Her çağrı bir kez işlensin diye provider_call_id tekil; rapor için de kullanılır.

create table if not exists public.crm_phone_calls (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  lead_id uuid references public.registration_leads(id) on delete set null,
  provider text not null default 'netgsm',
  provider_call_id text not null,
  direction text,
  answered boolean,
  caller_number text,
  called_number text,
  pbx_number text,
  duration_sec integer,
  started_at timestamptz not null default now(),
  recording_url text,
  raw jsonb,
  created_at timestamptz not null default now(),
  constraint crm_phone_calls_provider_call_unq unique (provider, provider_call_id)
);

create index if not exists crm_phone_calls_started_at_idx on public.crm_phone_calls (started_at desc);
create index if not exists crm_phone_calls_lead_id_idx on public.crm_phone_calls (lead_id);

-- Yalnız sunucu (service role) yazar/okur; istemciye açık politika yok.
alter table public.crm_phone_calls enable row level security;
