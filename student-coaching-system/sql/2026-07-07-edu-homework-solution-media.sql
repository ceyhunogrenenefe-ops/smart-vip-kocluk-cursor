-- Ödev teslimi: isteğe bağlı çoklu fotoğraf + video (mevcut storage_path geriye dönük uyumlu)

alter table public.edu_homework_submissions
  alter column storage_path drop not null;

alter table public.edu_homework_submissions
  add column if not exists photo_paths jsonb not null default '[]'::jsonb;

alter table public.edu_homework_submissions
  add column if not exists video_path text;

comment on column public.edu_homework_submissions.photo_paths is 'Supabase edu-homework-submissions bucket yolları (fotoğraf dizisi)';
comment on column public.edu_homework_submissions.video_path is 'Supabase edu-homework-submissions bucket video yolu';

-- Özel bucket (yoksa oluştur) — API service role ile yükler
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'edu-homework-submissions',
  'edu-homework-submissions',
  false,
  31457280,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do nothing;
