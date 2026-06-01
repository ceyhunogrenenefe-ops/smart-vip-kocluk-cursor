-- BBB otomatik yoklama: meeting kimliği, katılımcı şifresi (öğrenci join), görülen isimler
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS bbb_meeting_id text,
  ADD COLUMN IF NOT EXISTS bbb_attendee_pw text,
  ADD COLUMN IF NOT EXISTS bbb_seen_names jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attendance_auto_at timestamptz;

COMMENT ON COLUMN class_sessions.bbb_meeting_id IS 'BBB meetingID; getMeetingInfo / otomatik yoklama';
COMMENT ON COLUMN class_sessions.bbb_attendee_pw IS 'BBB attendeePW; öğrenci adıyla join URL üretimi';
COMMENT ON COLUMN class_sessions.bbb_seen_names IS 'Cron ile toplanan BBB fullName listesi (JSON dizi)';
COMMENT ON COLUMN class_sessions.attendance_auto_at IS 'Otomatik yoklama tamamlandı (UTC)';
