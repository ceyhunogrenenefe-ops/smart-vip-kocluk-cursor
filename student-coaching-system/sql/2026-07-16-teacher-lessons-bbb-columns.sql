-- Özel canlı dersler (teacher_lessons): BBB meetingID + attendeePW
-- class_sessions ile aynı alanlar; join / kayıt / kısa davet linki için gerekli.
-- Supabase → SQL Editor’da çalıştırın.

ALTER TABLE teacher_lessons
  ADD COLUMN IF NOT EXISTS bbb_meeting_id text,
  ADD COLUMN IF NOT EXISTS bbb_attendee_pw text;

COMMENT ON COLUMN teacher_lessons.bbb_meeting_id IS 'BBB meetingID; join yeniden oluşturma ve kayıt eşlemesi';
COMMENT ON COLUMN teacher_lessons.bbb_attendee_pw IS 'BBB attendeePW; öğrenci/misafir join URL üretimi';

NOTIFY pgrst, 'reload schema';
