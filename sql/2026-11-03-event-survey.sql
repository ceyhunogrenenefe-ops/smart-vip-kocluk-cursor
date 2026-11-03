-- Etkinlik sonrası memnuniyet anketi
-- • Hatırlatma türüne 'after' (etkinlik başlangıcından X dk sonra) eklenir
-- • Katılımcıya kişiye özel anket bağlantısı (survey_token)
-- • Anket yanıtları tablosu (katılımcı başına bir yanıt)
-- Yalnız ekleme / kısıt genişletme. Tekrar çalıştırılabilir.

alter table public.institution_event_reminders drop constraint if exists institution_event_reminders_kind_check;
alter table public.institution_event_reminders add constraint institution_event_reminders_kind_check
  check (kind in ('before', 'day_of', 'after'));

alter table public.institution_event_participants
  add column if not exists survey_token text;
create unique index if not exists institution_event_participants_survey_token_uidx
  on public.institution_event_participants (survey_token)
  where survey_token is not null;

create table if not exists public.institution_event_survey_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.institution_events(id) on delete cascade,
  participant_id uuid not null references public.institution_event_participants(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  expectation text check (expectation in ('evet', 'kismen', 'hayir')),
  want_info boolean,
  topics text,
  comment text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id)
);
create index if not exists institution_event_survey_responses_event_idx
  on public.institution_event_survey_responses (event_id);
comment on table public.institution_event_survey_responses is
  'Etkinlik sonrası anket yanıtları (/anket/:token). API service role ile yönetilir.';
alter table public.institution_event_survey_responses enable row level security;
