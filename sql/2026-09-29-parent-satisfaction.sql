-- Veli Memnuniyet ve Takip modülü (uygulandı).
--
-- Öğrenci, veli, sınıf, koç ve kullanıcı verileri KOPYALANMAZ. Mevcut tablolar
-- olduğu gibi okunur:
--   students        → id, name, phone, class_level, branch, parent_name,
--                     parent_phone, coach_id, enrollment_status, deleted_at
--   coaches         → eğitim koçu adı
--   classes + class_students → sınıf / şube adı
--   users           → arama temsilcisi
--   registration_leads → referans (tavsiye edilen tanıdık) buraya lead olarak
--                        açılır; paralel bir müşteri sistemi kurulmaz
--
-- Burada yalnız iki şey tutulur: kim kimi arayacak, ve görüşmede ne konuşuldu.
--
-- Arama durumu (Aranacak / Tekrar / Tamamlandı / Ulaşılamadı / Aksiyon) ayrı bir
-- kolonda TUTULMAZ; her görüşme ayrı satır olduğu için son görüşmeden türetilir
-- (api/_lib/parent-satisfaction-core.js → deriveCallStatus). Böylece geçmiş
-- üzerine yazılmaz, hiçbir anket kaybolmaz.

create table if not exists public.parent_call_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  student_id text not null references public.students (id) on delete cascade,
  agent_user_id text references public.users (id) on delete set null,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists parent_call_assignments_student_unq
  on public.parent_call_assignments (student_id);
create index if not exists parent_call_assignments_agent_idx
  on public.parent_call_assignments (institution_id, agent_user_id);

create table if not exists public.parent_call_surveys (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  student_id text not null references public.students (id) on delete cascade,
  agent_user_id text references public.users (id) on delete set null,
  call_result text not null default 'completed'
    check (call_result in ('completed','unreachable','call_later','phone_off','wrong_number')),
  call_back_at timestamptz,
  q_lessons text check (q_lessons in ('very_satisfied','satisfied','partly','unsatisfied')),
  q_lessons_note text,
  q_coach text check (q_coach in ('very_regular','enough','insufficient','unreachable')),
  q_coach_note text,
  q_tech text check (q_tech in ('fine','sometimes','serious')),
  q_tech_note text,
  tech_support_needed boolean not null default false,
  q_recommend text check (q_recommend in ('definitely','maybe','undecided','no')),
  general_note text,
  action_required boolean not null default false,
  action_type text check (action_type in (
    'coach_followup','teacher_meeting','tech_support','schedule_problem',
    'absence_problem','academic_dissatisfaction','manager_followup','other'
  )),
  action_note text,
  action_due_at date,
  action_done_at timestamptz,
  referral_lead_id uuid references public.registration_leads (id) on delete set null,
  referral_name text,
  referral_phone text,
  referral_grade text,
  referral_note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parent_call_surveys_student_idx
  on public.parent_call_surveys (student_id, created_at desc);
create index if not exists parent_call_surveys_agent_idx
  on public.parent_call_surveys (institution_id, agent_user_id, created_at desc);
create index if not exists parent_call_surveys_action_idx
  on public.parent_call_surveys (institution_id, action_required) where action_required;

alter table public.parent_call_assignments enable row level security;
alter table public.parent_call_surveys enable row level security;
