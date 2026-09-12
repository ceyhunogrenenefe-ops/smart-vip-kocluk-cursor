-- Edesis deneme kataloğu + yerel atama (sınıf / öğrenci)
-- Öğrenci "Sınava Gir" listesi yalnızca bu atamalara göre filtrelenir (backend).

create table if not exists public.edesis_exams (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  edesis_exam_id text not null,
  title text not null default '',
  exam_date date,
  exam_type text,
  grade_name text,
  is_online boolean not null default true,
  status text,
  duration_seconds integer,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, edesis_exam_id)
);

create index if not exists edesis_exams_institution_idx
  on public.edesis_exams (institution_id, exam_date desc nulls last);
create index if not exists edesis_exams_edesis_id_idx
  on public.edesis_exams (edesis_exam_id);

create table if not exists public.edesis_exam_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  edesis_exam_id text not null,
  -- class | student
  target_type text not null check (target_type in ('class', 'student')),
  class_id text references public.classes (id) on delete cascade,
  student_id text references public.students (id) on delete cascade,
  assigned_by text references public.users (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint edesis_exam_assignments_target_chk check (
    (target_type = 'class' and class_id is not null and student_id is null)
    or (target_type = 'student' and student_id is not null and class_id is null)
  )
);

-- Aynı sınavı aynı sınıfa / öğrenciye çift atama yok
create unique index if not exists edesis_exam_assignments_class_unq
  on public.edesis_exam_assignments (institution_id, edesis_exam_id, class_id)
  where target_type = 'class' and class_id is not null;

create unique index if not exists edesis_exam_assignments_student_unq
  on public.edesis_exam_assignments (institution_id, edesis_exam_id, student_id)
  where target_type = 'student' and student_id is not null;

create index if not exists edesis_exam_assignments_exam_idx
  on public.edesis_exam_assignments (institution_id, edesis_exam_id);

create index if not exists edesis_exam_assignments_student_idx
  on public.edesis_exam_assignments (student_id)
  where student_id is not null;

create index if not exists edesis_exam_assignments_class_idx
  on public.edesis_exam_assignments (class_id)
  where class_id is not null;

notify pgrst, 'reload schema';
