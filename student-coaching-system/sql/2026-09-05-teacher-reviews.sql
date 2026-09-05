-- Öğretmen Değerlendirme ve Yorum Sistemi
-- Supabase SQL Editor'da bir kez çalıştırın.

CREATE TABLE IF NOT EXISTS public.teacher_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id text NULL REFERENCES public.students(id) ON DELETE SET NULL,
  lesson_id uuid NULL REFERENCES public.teacher_lessons(id) ON DELETE SET NULL,
  reviewer_type text NOT NULL
    CHECK (reviewer_type IN ('STUDENT', 'PARENT')),
  reviewer_name text NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_reviews_teacher_public
  ON public.teacher_reviews (teacher_id, created_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_teacher_reviews_lesson
  ON public.teacher_reviews (lesson_id)
  WHERE lesson_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_reviews_student_lesson
  ON public.teacher_reviews (lesson_id, reviewer_type)
  WHERE lesson_id IS NOT NULL AND reviewer_type = 'STUDENT';

-- Veli değerlendirme daveti (şifresiz public form)
CREATE TABLE IF NOT EXISTS public.teacher_review_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  teacher_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id text NULL REFERENCES public.students(id) ON DELETE SET NULL,
  lesson_id uuid NULL REFERENCES public.teacher_lessons(id) ON DELETE SET NULL,
  parent_name text NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_by text NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_review_invite_token
  ON public.teacher_review_invite_tokens (token)
  WHERE used_at IS NULL;

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS average_rating numeric(3, 2);

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS total_reviews integer NOT NULL DEFAULT 0;

COMMENT ON TABLE public.teacher_reviews IS
  'Öğrenci/veli öğretmen değerlendirmeleri; profil altında listelenir.';
COMMENT ON COLUMN public.teacher_profiles.average_rating IS
  'Herkese açık yorumların ortalama puanı (1-5).';
COMMENT ON COLUMN public.teacher_profiles.total_reviews IS
  'Herkese açık değerlendirme sayısı.';

NOTIFY pgrst, 'reload schema';
