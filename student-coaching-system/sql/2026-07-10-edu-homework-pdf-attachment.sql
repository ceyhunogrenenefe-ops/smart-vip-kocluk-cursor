-- Öğretmen ödev tanımına PDF eki (sınıf veya seçili öğrenciler)

alter table public.edu_homework
  add column if not exists attachment_pdf_path text;

alter table public.edu_homework
  add column if not exists attachment_pdf_name text;

comment on column public.edu_homework.attachment_pdf_path is 'Supabase edu-homework-attachments bucket — öğretmen PDF yolu';
comment on column public.edu_homework.attachment_pdf_name is 'Öğretmenin yüklediği PDF dosya adı (görüntüleme)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'edu-homework-attachments',
  'edu-homework-attachments',
  false,
  15728640,
  array['application/pdf']
)
on conflict (id) do nothing;
