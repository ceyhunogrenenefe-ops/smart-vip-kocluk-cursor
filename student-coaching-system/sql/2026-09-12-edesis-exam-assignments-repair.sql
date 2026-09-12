-- Edesis deneme atama şeması — idempotent onarım
-- Hata: column "target_type" does not exist
-- Sebep: edesis_exam_assignments daha önce eksik kolonlarla oluşmuş;
--        CREATE TABLE IF NOT EXISTS atlanıyor, index ise target_type bekliyor.
-- Bu script mevcut tabloyu güvenle tamamlar.

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

-- edesis_exams eksik kolonlar
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
    where conname = 'edesis_exams_institution_id_edesis_exam_id_key'
      and conrelid = 'public.edesis_exams'::regclass
  ) and not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'edesis_exams'
      and indexdef ilike '%(institution_id, edesis_exam_id)%'
  ) then
    begin
      alter table public.edesis_exams
        add constraint edesis_exams_institution_id_edesis_exam_id_key
        unique (institution_id, edesis_exam_id);
    exception when others then
      -- unique zaten başka isimle varsa yoksay
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

-- Kritik: eksik kolonları ekle (CREATE TABLE IF NOT EXISTS atlandıysa)
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

-- Eski/yanlış kolon adlarından taşı (varsa)
do $$
begin
  -- assignment_type → target_type
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'edesis_exam_assignments' and column_name = 'assignment_type'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'edesis_exam_assignments' and column_name = 'target_type'
  ) then
    update public.edesis_exam_assignments
    set target_type = assignment_type
    where target_type is null and assignment_type is not null;
  end if;

  -- assigned_by_user_id → assigned_by
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'edesis_exam_assignments' and column_name = 'assigned_by_user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'edesis_exam_assignments' and column_name = 'assigned_by'
  ) then
    update public.edesis_exam_assignments
    set assigned_by = assigned_by_user_id
    where assigned_by is null and assigned_by_user_id is not null;
  end if;
end $$;

-- target_type NOT NULL + check
do $$
begin
  -- boş satır kalmasın
  update public.edesis_exam_assignments
  set target_type = case
    when class_id is not null and student_id is null then 'class'
    when student_id is not null and class_id is null then 'student'
    else target_type
  end
  where target_type is null;

  -- hâlâ null kalan bozuk satırları temizle (boş tablo / test artığı)
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

-- Index’ler (artık target_type kesin var)
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
