-- BBB kayıt oynatma URL önbelleği (getRecordings sonucu)
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS recording_link text;
ALTER TABLE teacher_lessons ADD COLUMN IF NOT EXISTS recording_link text;

COMMENT ON COLUMN class_sessions.recording_link IS 'BBB kayıt oynatma URL; bbb-recording API ile doldurulur.';
COMMENT ON COLUMN teacher_lessons.recording_link IS 'BBB kayıt oynatma URL; bbb-recording API ile doldurulur.';
