-- Soru Sor / Soru Çözüm modülü (additive — mevcut tablolara dokunmaz)
-- institutions.id / students.id / users.id = TEXT

-- ---------------------------------------------------------------------------
-- Ana tablo
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete set null,
  student_id text not null references public.students (id) on delete cascade,
  subject text not null,
  grade text not null,
  topic text,
  description text,
  image_url text,
  status text not null default 'waiting' check (
    status in ('waiting', 'claimed', 'solving', 'solved', 'cancelled')
  ),
  claimed_by text references public.users (id) on delete set null,
  solved_by text references public.users (id) on delete set null,
  solved_text text,
  solved_image_url text,
  solved_video_url text,
  solved_audio_url text,
  solved_pdf_url text,
  priority smallint not null default 0,
  satisfaction_rating smallint check (satisfaction_rating is null or (satisfaction_rating between 1 and 5)),
  source text not null default 'web' check (source in ('web', 'whatsapp', 'api')),
  ai_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  solved_at timestamptz,
  claimed_at timestamptz
);

create index if not exists idx_questions_student on public.questions (student_id, created_at desc);
create index if not exists idx_questions_pool on public.questions (status, subject, grade, created_at desc)
  where status in ('waiting', 'claimed', 'solving');
create index if not exists idx_questions_claimed_by on public.questions (claimed_by, status);
create index if not exists idx_questions_institution on public.questions (institution_id, status);

-- ---------------------------------------------------------------------------
-- Claim log + öğretmen istatistik
-- ---------------------------------------------------------------------------
create table if not exists public.question_claim_logs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  teacher_user_id text not null references public.users (id) on delete cascade,
  action text not null check (action in ('claim', 'release', 'solve', 'cancel')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_claim_logs_q on public.question_claim_logs (question_id, created_at desc);

create table if not exists public.teacher_question_stats (
  teacher_user_id text primary key references public.users (id) on delete cascade,
  institution_id text references public.institutions (id) on delete set null,
  solved_count int not null default 0,
  claimed_count int not null default 0,
  avg_solve_seconds numeric,
  rating_sum int not null default 0,
  rating_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Öğretmen branş tercihi (havuz filtresi)
create table if not exists public.question_help_teacher_profiles (
  user_id text primary key references public.users (id) on delete cascade,
  institution_id text references public.institutions (id) on delete set null,
  branches text[] not null default '{}',
  notify_whatsapp boolean not null default true,
  updated_at timestamptz not null default now()
);

-- In-app bildirimler
create table if not exists public.question_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users (id) on delete cascade,
  question_id uuid references public.questions (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_notifications_user on public.question_notifications (user_id, read_at nulls first, created_at desc);

-- ---------------------------------------------------------------------------
-- Atomic claim (race-safe)
-- ---------------------------------------------------------------------------
create or replace function public.claim_question_atomic(
  p_question_id uuid,
  p_teacher_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.questions;
begin
  if p_teacher_user_id is null or trim(p_teacher_user_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'teacher_required');
  end if;

  update public.questions
  set
    status = 'claimed',
    claimed_by = p_teacher_user_id,
    claimed_at = now(),
    updated_at = now()
  where id = p_question_id
    and status = 'waiting'
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'already_claimed_or_unavailable');
  end if;

  insert into public.question_claim_logs (question_id, teacher_user_id, action)
  values (p_question_id, p_teacher_user_id, 'claim');

  insert into public.teacher_question_stats (teacher_user_id, institution_id, claimed_count, updated_at)
  values (p_teacher_user_id, v_row.institution_id, 1, now())
  on conflict (teacher_user_id) do update
  set
    claimed_count = teacher_question_stats.claimed_count + 1,
    institution_id = coalesce(excluded.institution_id, teacher_question_stats.institution_id),
    updated_at = now();

  return jsonb_build_object('ok', true, 'data', to_jsonb(v_row));
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-help',
  'question-help',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/mp4', 'video/mp4']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS (service role API birincil; istemci doğrudan erişmez)
-- ---------------------------------------------------------------------------
alter table public.questions enable row level security;
alter table public.question_claim_logs enable row level security;
alter table public.teacher_question_stats enable row level security;
alter table public.question_help_teacher_profiles enable row level security;
alter table public.question_notifications enable row level security;

comment on table public.questions is 'Soru Sor modülü — öğrenci soruları ve çözümler';
comment on column public.questions.ai_metadata is 'İleride OCR / AI öneri için genişletilebilir JSON';

-- Realtime: Supabase Dashboard → Database → Publications → supabase_realtime → `questions` tablosunu ekleyin
