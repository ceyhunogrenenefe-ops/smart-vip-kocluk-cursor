-- Öğretmen profilinde birden fazla tanıtım videosu
alter table public.teacher_profiles
  add column if not exists videos jsonb not null default '[]'::jsonb;

comment on column public.teacher_profiles.videos is
  'Tanıtım videoları listesi: [{ id, url, title }]. video_url birincil (ilk) video ile senkron tutulur.';

-- Mevcut tek video_url değerlerini videos listesine taşı
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
