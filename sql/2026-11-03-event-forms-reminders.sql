-- Etkinlik Formları + çok aşamalı hatırlatmalar
-- CRM > Etkinlik Formları: etkinliğe herkese açık kayıt formu (/f/:slug), KVKK onayı,
-- formu dolduranlar institution_event_participants'a düşer; hatırlatmalar cron ile gider.
-- Yalnızca ekleme yapar (mevcut veriye dokunmaz). Tekrar çalıştırılabilir.

-- 1) Etkinliğe form ayarları
alter table public.institution_events
  add column if not exists form_enabled boolean not null default false,
  add column if not exists form_slug text,
  add column if not exists form_settings jsonb not null default '{}'::jsonb;

create unique index if not exists institution_events_form_slug_uidx
  on public.institution_events (lower(form_slug))
  where form_slug is not null;

comment on column public.institution_events.form_settings is
  'Form başlığı/açıklaması, alan ayarları, KVKK metni, onay mesajı ve CRM lead bayrağı (JSON).';

-- 2) Katılımcıya form bilgileri
alter table public.institution_event_participants
  add column if not exists parent_name text,
  add column if not exists student_name text,
  add column if not exists grade text,
  add column if not exists kvkk_accepted_at timestamptz,
  add column if not exists form_meta jsonb,
  add column if not exists lead_id text;

create index if not exists institution_event_participants_event_phone_idx
  on public.institution_event_participants (event_id, phone);

-- 3) Hatırlatma kuralları (etkinlik başına birden çok)
create table if not exists public.institution_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.institution_events(id) on delete cascade,
  kind text not null default 'before' check (kind in ('before', 'day_of')),
  -- kind=before: etkinlikten kaç dakika önce (1440 = 1 gün)
  offset_minutes integer,
  -- kind=day_of: etkinlik günü saat kaçta
  at_time time,
  template_type text not null default 'institution_event_invite',
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institution_event_reminders_event_idx
  on public.institution_event_reminders (event_id);

comment on table public.institution_event_reminders is
  'Etkinlik hatırlatma kuralları (cron/institution-events). API service role ile yönetilir.';

-- 4) Hatırlatma gönderim kaydı — aynı kişiye aynı hatırlatma bir kez
create table if not exists public.institution_event_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.institution_event_reminders(id) on delete cascade,
  participant_id uuid not null references public.institution_event_participants(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reminder_id, participant_id)
);

comment on table public.institution_event_reminder_sends is
  'Hatırlatma tekillik + sonuç logu. API service role ile yönetilir.';

-- Yalnızca service role (API) erişir; anon/authenticated için politika yok.
alter table public.institution_event_reminders enable row level security;
alter table public.institution_event_reminder_sends enable row level security;
