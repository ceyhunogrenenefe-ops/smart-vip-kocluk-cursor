-- Video Soru Çözüm Merkezi: YouTube + Vimeo + Google Drive + harici link
-- Mevcut kurulumda 2026-10-26-video-solution-center.sql çalıştırıldıktan sonra uygulayın.

alter table public.video_solution_questions
  add column if not exists video_provider text not null default 'youtube';

alter table public.video_solution_questions
  add column if not exists video_ref text;

update public.video_solution_questions
set video_ref = youtube_video_id
where video_ref is null and youtube_video_id is not null;

alter table public.video_solution_questions
  alter column youtube_video_id drop not null;

alter table public.video_solution_questions
  drop constraint if exists video_solution_questions_yt_id_chk;

alter table public.video_solution_questions
  drop constraint if exists video_solution_questions_provider_chk;

alter table public.video_solution_questions
  add constraint video_solution_questions_provider_chk check (
    video_provider in ('youtube', 'vimeo', 'google_drive', 'external')
  );

alter table public.video_solution_questions
  drop constraint if exists video_solution_questions_ref_chk;

alter table public.video_solution_questions
  add constraint video_solution_questions_ref_chk check (
    char_length(trim(coalesce(video_ref, youtube_video_id, ''))) >= 3
    or char_length(trim(coalesce(youtube_url, ''))) >= 8
  );

comment on column public.video_solution_questions.video_provider is
  'youtube | vimeo | google_drive | external';
comment on column public.video_solution_questions.video_ref is
  'Sağlayıcıya özel kimlik (YouTube id, Vimeo id, Drive file id) veya external için tam URL';
