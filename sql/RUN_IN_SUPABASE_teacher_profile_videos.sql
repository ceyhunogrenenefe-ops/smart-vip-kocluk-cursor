-- RUN IN SUPABASE SQL EDITOR (production)
-- Panel: öğretmen profilinde birden fazla tanıtım videosu
-- File: sql/2026-07-26-teacher-profile-videos.sql
-- Mevcut öğretmen verilerini silmez; video_url varsa videos listesine taşır.

alter table public.teacher_profiles
  add column if not exists videos jsonb not null default '[]'::jsonb;

comment on column public.teacher_profiles.videos is
  'Tanıtım videoları listesi: [{ id, url, title }]. video_url birincil (ilk) video ile senkron tutulur.';

update public.teacher_profiles
set videos = jsonb_build_array(
  jsonb_build_object(
    'id', 'v-1',
    'url', video_url,
    'title', ''
  )
)
where coalesce(nullif(trim(video_url), ''), '') <> ''
  and (
    videos is null
    or videos = '[]'::jsonb
    or jsonb_typeof(videos) <> 'array'
    or jsonb_array_length(videos) = 0
  );
