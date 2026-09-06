-- Grup canlı ders (class_sessions) için öğretmen yorumları
-- Supabase SQL Editor'da bir kez çalıştırın.

ALTER TABLE public.teacher_reviews
  ADD COLUMN IF NOT EXISTS class_session_id uuid NULL
    REFERENCES public.class_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_reviews_class_session
  ON public.teacher_reviews (class_session_id)
  WHERE class_session_id IS NOT NULL;

-- Aynı öğrenci aynı grup oturumunu bir kez değerlendirebilir
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_reviews_student_class_session
  ON public.teacher_reviews (class_session_id, student_id, reviewer_type)
  WHERE class_session_id IS NOT NULL
    AND student_id IS NOT NULL
    AND reviewer_type = 'STUDENT';

-- Veli davet tokenlarına grup oturumu bağla
ALTER TABLE public.teacher_review_invite_tokens
  ADD COLUMN IF NOT EXISTS class_session_id uuid NULL
    REFERENCES public.class_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_review_invite_class_session
  ON public.teacher_review_invite_tokens (class_session_id)
  WHERE class_session_id IS NOT NULL AND used_at IS NULL;

COMMENT ON COLUMN public.teacher_reviews.class_session_id IS
  'Grup canlı ders (class_sessions); özel ders için lesson_id kullanılır.';

NOTIFY pgrst, 'reload schema';
