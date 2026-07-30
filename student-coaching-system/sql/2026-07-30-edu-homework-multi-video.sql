-- Ödev teslimi: birden fazla video (video_path geriye dönük uyumlu)
alter table public.edu_homework_submissions
  add column if not exists video_paths jsonb not null default '[]'::jsonb;

comment on column public.edu_homework_submissions.video_paths is
  'Supabase edu-homework-submissions bucket video yolları (çoklu); video_path ilk elemanla senkron tutulur';

-- Eski tekil video_path → video_paths senkronu
update public.edu_homework_submissions h
set video_paths = jsonb_build_array(h.video_path)
where h.video_path is not null
  and trim(h.video_path) <> ''
  and (
    h.video_paths is null
    or h.video_paths = '[]'::jsonb
  );
