-- Planlayıcı aktarımı: haftalık şablonda BBB kimliği (class_sessions ile uyumlu)
ALTER TABLE class_weekly_slots
  ADD COLUMN IF NOT EXISTS bbb_meeting_id text,
  ADD COLUMN IF NOT EXISTS bbb_attendee_pw text;

COMMENT ON COLUMN class_weekly_slots.bbb_meeting_id IS 'BBB meetingID; planlayıcı aktarımı ve ortak ders link paylaşımı';
COMMENT ON COLUMN class_weekly_slots.bbb_attendee_pw IS 'BBB attendeePW; öğrenci join URL üretimi';
