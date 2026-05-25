-- AI Soru Havuzu + Denemeler
-- Bu dosya 2026-05-25-ai-agents.sql DOSYASINDAN SONRA calistirilmali.

create table if not exists public.ai_exam_questions (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  document_id text references public.ai_agent_documents (id) on delete set null,
  page_no integer,
  question_text text not null,
  options jsonb not null default '[]'::jsonb,
  answer_key text,
  solution text,
  topic text,
  subtopic text,
  difficulty text check (difficulty in ('kolay','orta','zor')),
  question_type text not null default 'multiple_choice',
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  ai_model text,
  ai_confidence numeric(3,2),
  created_by text references public.users (id) on delete set null,
  reviewed_by text references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_exam_questions_agent_idx on public.ai_exam_questions (agent_id, status);
create index if not exists ai_exam_questions_topic_idx on public.ai_exam_questions (agent_id, topic, difficulty);
create index if not exists ai_exam_questions_doc_idx on public.ai_exam_questions (document_id);

create table if not exists public.ai_exam_papers (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  title text not null,
  description text,
  duration_minutes integer not null default 60,
  question_count integer not null default 0,
  total_score numeric(6,2) default 100,
  question_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by text references public.users (id) on delete set null,
  institution_id text references public.institutions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_exam_papers_agent_idx on public.ai_exam_papers (agent_id, status);
create index if not exists ai_exam_papers_creator_idx on public.ai_exam_papers (created_by);

create table if not exists public.ai_exam_assignments (
  id text primary key default gen_random_uuid()::text,
  paper_id text not null references public.ai_exam_papers (id) on delete cascade,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  student_user_id text not null references public.users (id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed','expired')),
  assigned_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_exam_assignments_unq
  on public.ai_exam_assignments (paper_id, student_user_id);
create index if not exists ai_exam_assignments_student_idx
  on public.ai_exam_assignments (student_user_id, status);

create table if not exists public.ai_exam_attempts (
  id text primary key default gen_random_uuid()::text,
  assignment_id text not null references public.ai_exam_assignments (id) on delete cascade,
  paper_id text not null references public.ai_exam_papers (id) on delete cascade,
  student_user_id text not null references public.users (id) on delete cascade,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  score numeric(6,2),
  correct_count integer default 0,
  wrong_count integer default 0,
  empty_count integer default 0,
  duration_seconds integer,
  topic_breakdown jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','graded'))
);

create unique index if not exists ai_exam_attempts_unq
  on public.ai_exam_attempts (assignment_id, student_user_id);
create index if not exists ai_exam_attempts_student_idx
  on public.ai_exam_attempts (student_user_id, status);
