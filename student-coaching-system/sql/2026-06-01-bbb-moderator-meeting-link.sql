-- BBB otomatik odalar: öğrenci (attendee) + öğretmen (moderator) ayrı join URL
-- Öğretmen moderatör linkiyle girince kaydı kendisi başlatır/durdurur.

ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS meeting_link_moderator TEXT;

ALTER TABLE class_weekly_slots
  ADD COLUMN IF NOT EXISTS meeting_link_moderator TEXT;

ALTER TABLE teacher_lessons
  ADD COLUMN IF NOT EXISTS meeting_link_moderator TEXT;

ALTER TABLE teacher_lesson_series
  ADD COLUMN IF NOT EXISTS meeting_link_moderator TEXT;

COMMENT ON COLUMN class_sessions.meeting_link_moderator IS 'BBB moderator join URL; öğrenci/veli hatırlatmalarında kullanılmaz.';
COMMENT ON COLUMN teacher_lessons.meeting_link_moderator IS 'BBB moderator join URL; öğretmen/koç Katıl için.';
