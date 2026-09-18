-- FAZ 2: satış aşamaları + sorumlu temsilci + otomatik dağıtım (geriye uyumlu)

-- Aşama kısıtı: mevcut 13 aşama aynen korunur, yeni aşamalar eklenir
alter table public.registration_leads drop constraint if exists registration_leads_stage_check;
alter table public.registration_leads add constraint registration_leads_stage_check check (stage = any (array[
  'new_lead', 'first_contact_pending', 'first_contact_completed', 'presentation_scheduled',
  'trial_lesson_scheduled', 'trial_lesson_completed', 'offer_sent', 'considering', 'follow_up',
  'payment_pending', 'postponed', 'confirmed', 'lost',
  'needs_identified', 'program_offered', 'spouse_discussion', 'registration_pending',
  'no_response', 'unreachable', 'not_interested'
]));

-- Kurum bazlı CRM ayarları (dağıtım, ileride takip planları / SLA)
create table if not exists public.crm_settings (
  institution_id text primary key,
  round_robin_enabled boolean not null default true,
  rr_last_user_id text,
  follow_up_rules jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.crm_settings enable row level security;

-- Temsilci otomatik dağıtıma dahil mi
alter table public.crm_user_assignments
  add column if not exists in_round_robin boolean not null default true;

-- Meta App Review test hesabı dağıtıma girmesin
update public.crm_user_assignments a
set in_round_robin = false
from public.users u
where u.id = a.user_id and lower(u.email) = 'metareviewer@smartkocluk.com';
