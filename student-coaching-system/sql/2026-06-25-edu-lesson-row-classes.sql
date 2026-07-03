-- EduPanel: bir konuyu birden fazla sınıfa bağlama
create table if not exists public.edu_lesson_row_classes (
  lesson_row_id uuid not null references public.edu_lesson_rows(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lesson_row_id, class_id)
);

create index if not exists idx_edu_lesson_row_classes_class
  on public.edu_lesson_row_classes(class_id);

-- Mevcut satırlar: primary class_id junction'a kopyala
insert into public.edu_lesson_row_classes (lesson_row_id, class_id)
select id, class_id from public.edu_lesson_rows
on conflict do nothing;

comment on table public.edu_lesson_row_classes is 'EduPanel konu ↔ çoklu sınıf (edu_lesson_rows.class_id birincil sınıf).';
