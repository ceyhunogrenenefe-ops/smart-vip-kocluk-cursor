-- Ödev teslim bucket: 30 MB → 500 MB (2 dk telefon videoları için)
-- Supabase SQL Editor’de çalıştırın (API de otomatik yükseltmeyi dener).

update storage.buckets
set
  file_size_limit = 524288000,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
where id = 'edu-homework-submissions';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'edu-homework-submissions',
  'edu-homework-submissions',
  false,
  524288000,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;
