-- Hızlı çalıştır: teacher_lessons BBB kolonları (prod hatası: column bbb_meeting_id does not exist)
-- Supabase Dashboard → SQL Editor → Run

ALTER TABLE public.teacher_lessons
  ADD COLUMN IF NOT EXISTS bbb_meeting_id text,
  ADD COLUMN IF NOT EXISTS bbb_attendee_pw text;

COMMENT ON COLUMN public.teacher_lessons.bbb_meeting_id IS 'BBB meetingID; join yeniden oluşturma ve kayıt eşlemesi';
COMMENT ON COLUMN public.teacher_lessons.bbb_attendee_pw IS 'BBB attendeePW; öğrenci/misafir join URL üretimi';

NOTIFY pgrst, 'reload schema';
