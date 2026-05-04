-- Online Coaching Meetings: Google Meet + hatırlatma + integrations
-- Smart Koçluk şeması: users / students / coaches / institutions.id = TEXT (diğer SQL dosyalarıyla aynı)
-- Supabase → SQL Editor’da çalıştırın.
--
-- Daha önce hatalı sürüm denendiysa önce kaldırın, sonra bu dosyayı çalıştırın:
--   DROP TABLE IF EXISTS meeting_notification_log;
--   DROP TABLE IF EXISTS meetings;
--   DROP TABLE IF EXISTS integrations_google;

-- İsteğe bağlı: kullanıcı ↔ öğrenci satırı
ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_user_id_uidx ON students(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integrations_google (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  expiry_date_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integrations_google_user_id_idx ON integrations_google(user_id);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  coach_id TEXT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  meet_link TEXT NOT NULL,
  google_calendar_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'missed')),
  notes TEXT,
  attended BOOLEAN DEFAULT NULL,
  ai_summary TEXT,
  whatsapp_created_sent BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meetings_coach_idx ON meetings(coach_id);
CREATE INDEX IF NOT EXISTS meetings_student_idx ON meetings(student_id);
CREATE INDEX IF NOT EXISTS meetings_start_idx ON meetings(start_time);
CREATE INDEX IF NOT EXISTS meetings_institution_idx ON meetings(institution_id);
CREATE INDEX IF NOT EXISTS meetings_status_start_idx ON meetings(status, start_time);

CREATE TABLE IF NOT EXISTS meeting_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  kind TEXT NOT NULL,
  recipient_e164 TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  external_sid TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, channel, kind)
);

CREATE INDEX IF NOT EXISTS meeting_notification_pending_idx ON meeting_notification_log(status, created_at);

COMMENT ON COLUMN meetings.ai_summary IS 'Reserved for AI post-call summaries (populate via future workflow).';
