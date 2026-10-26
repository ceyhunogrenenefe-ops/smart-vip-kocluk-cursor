-- Video Soru Çözüm Merkezi — test ortamı doğrulama (veri yazmaz; ROLLBACK ile biter)
-- Önce 2026-10-26-video-solution-center.sql migration'ını çalıştırın.

begin;

insert into public.video_solution_sets (
  institution_id,
  slug,
  school_year,
  grade_level,
  subject,
  term,
  exam_number,
  work_type,
  title,
  status
) values (
  'test-inst',
  '2025-8-matematik-yazili1-calisma1',
  '2025-2026',
  8,
  'Matematik',
  1,
  1,
  'yazili',
  '8. Sınıf 1. Yazılı — Çalışma 1',
  'published'
);

insert into public.video_solution_questions (
  set_id,
  question_number,
  title,
  topic,
  youtube_video_id,
  youtube_url,
  status,
  sort_order
)
select
  id,
  1,
  'Soru 1',
  'Üslü sayılar',
  'dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'published',
  1
from public.video_solution_sets
where slug = '2025-8-matematik-yazili1-calisma1';

-- Aynı set + soru numarası tekrar eklenememeli:
-- insert ... question_number 1 → unique violation beklenir

-- Geçersiz slug (büyük harf) reddedilmeli:
-- insert ... slug 'Bad-Slug' → check violation

select s.slug, q.question_number, q.youtube_video_id
from public.video_solution_sets s
join public.video_solution_questions q on q.set_id = s.id
where s.slug = '2025-8-matematik-yazili1-calisma1';

rollback;
