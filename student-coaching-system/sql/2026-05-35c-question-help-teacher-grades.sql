-- Öğretmen profiline sınıf/sınav grubu filtresi (additive)
alter table public.question_help_teacher_profiles
  add column if not exists grades text[] not null default '{}';

create index if not exists idx_qhtp_grades_gin
  on public.question_help_teacher_profiles using gin (grades);

comment on column public.question_help_teacher_profiles.grades is
  'Soru havuzu: 3-12, LGS, TYT, AYT — questions.grade ile eşleşir';
