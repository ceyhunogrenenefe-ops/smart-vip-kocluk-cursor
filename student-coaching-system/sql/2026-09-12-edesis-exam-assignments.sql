-- Edesis deneme kataloğu + yerel atama (sınıf / öğrenci)
-- Öğrenci "Sınava Gir" listesi yalnızca bu atamalara göre filtrelenir (backend).
-- Idempotent: kısmi/eski tablo varsa kolonları ALTER ile tamamlar.
--
-- Not: Her sınav için ayrı tablo YOKTUR. Bu iki tablo tüm denemeler için ortaktır.
-- Üretimde API (ensureEdesisExamAssignmentSchema) ilk senkron/atamada otomatik kurar;
-- Vercel’de SUPABASE_DB_URL veya SUPABASE_DB_PASSWORD gerekir. Manuel çalıştırma yalnızca
-- otomatik kurulum ortam değişkeni yoksa yedek yoldur.

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
  updated_at timestamptz not null default now()
);

alter table public.edesis_exams add column if not exists institution_id text;
alter table public.edesis_exams add column if not exists edesis_exam_id text;
alter table public.edesis_exams add column if not exists title text not null default '';
alter table public.edesis_exams add column if not exists exam_date date;
alter table public.edesis_exams add column if not exists exam_type text;
alter table public.edesis_exams add column if not exists grade_name text;
alter table public.edesis_exams add column if not exists is_online boolean not null default true;
alter table public.edesis_exams add column if not exists status text;
alter table public.edesis_exams add column if not exists duration_seconds integer;
alter table public.edesis_exams add column if not exists raw jsonb not null default '{}'::jsonb;
alter table public.edesis_exams add column if not exists synced_at timestamptz not null default now();
alter table public.edesis_exams add column if not exists created_at timestamptz not null default now();
alter table public.edesis_exams add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.edesis_exams'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%institution_id%edesis_exam_id%'
  ) then
    begin
      alter table public.edesis_exams
        add constraint edesis_exams_institution_id_edesis_exam_id_key
        unique (institution_id, edesis_exam_id);
    exception when others then
      null;
    end;
  end if;
end $$;

create index if not exists edesis_exams_institution_idx
  on public.edesis_exams (institution_id, exam_date desc nulls last);
create index if not exists edesis_exams_edesis_id_idx
  on public.edesis_exams (edesis_exam_id);

create table if not exists public.edesis_exam_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  edesis_exam_id text not null,
  target_type text not null check (target_type in ('class', 'student')),
  class_id text references public.classes (id) on delete cascade,
  student_id text references public.students (id) on delete cascade,
  assigned_by text references public.users (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS atlandıysa eksik kolonları ekle
alter table public.edesis_exam_assignments add column if not exists institution_id text;
alter table public.edesis_exam_assignments add column if not exists edesis_exam_id text;
alter table public.edesis_exam_assignments add column if not exists target_type text;
alter table public.edesis_exam_assignments add column if not exists class_id text;
alter table public.edesis_exam_assignments add column if not exists student_id text;
alter table public.edesis_exam_assignments add column if not exists assigned_by text;
alter table public.edesis_exam_assignments add column if not exists starts_at timestamptz;
alter table public.edesis_exam_assignments add column if not exists ends_at timestamptz;
alter table public.edesis_exam_assignments add column if not exists notes text;
alter table public.edesis_exam_assignments add column if not exists created_at timestamptz not null default now();

do $$
begin
  update public.edesis_exam_assignments
  set target_type = case
    when class_id is not null and student_id is null then 'class'
    when student_id is not null and class_id is null then 'student'
    else target_type
  end
  where target_type is null;

  delete from public.edesis_exam_assignments
  where target_type is null
     or target_type not in ('class', 'student');

  begin
    alter table public.edesis_exam_assignments
      alter column target_type set not null;
  exception when others then
    null;
  end;

  begin
    alter table public.edesis_exam_assignments
      drop constraint if exists edesis_exam_assignments_target_type_check;
    alter table public.edesis_exam_assignments
      add constraint edesis_exam_assignments_target_type_check
      check (target_type in ('class', 'student'));
  exception when others then
    null;
  end;

  begin
    alter table public.edesis_exam_assignments
      drop constraint if exists edesis_exam_assignments_target_chk;
    alter table public.edesis_exam_assignments
      add constraint edesis_exam_assignments_target_chk check (
        (target_type = 'class' and class_id is not null and student_id is null)
        or (target_type = 'student' and student_id is not null and class_id is null)
      );
  exception when others then
    null;
  end;
end $$;

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
