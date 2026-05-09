alter table if exists public.students
  add column if not exists birth_date date null;

comment on column public.students.birth_date is 'Ogrencinin dogum tarihi (YYYY-MM-DD)';
