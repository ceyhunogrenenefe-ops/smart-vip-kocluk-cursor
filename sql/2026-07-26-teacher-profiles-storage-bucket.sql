-- Öğretmen vitrin profil fotoğrafı / belge Storage bucket
-- Supabase → SQL Editor'de çalıştırın.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teacher-profiles',
  'teacher-profiles',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public okuma (foto URL'lerinin sitede açılması için)
drop policy if exists "teacher_profiles_public_read" on storage.objects;
create policy "teacher_profiles_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'teacher-profiles');
