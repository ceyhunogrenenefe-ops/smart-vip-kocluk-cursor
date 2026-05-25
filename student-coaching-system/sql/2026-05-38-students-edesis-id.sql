-- Edesis öğrenci eşlemesi: External Api ogrenciId → Smart Koçluk students
alter table if exists public.students
  add column if not exists edesis_ogrenci_id text;

create index if not exists idx_students_edesis_ogrenci_id
  on public.students (edesis_ogrenci_id)
  where edesis_ogrenci_id is not null;

comment on column public.students.edesis_ogrenci_id is 'Edesis External Api öğrenci kimliği — sınav senkron eşlemesi';
