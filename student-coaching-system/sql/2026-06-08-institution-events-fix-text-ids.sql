-- institution_events: TEXT id uyumu (institutions.id / students.id / users.id = TEXT)
-- Eski UUID sürümü hatalıysa veya tablo yoksa bunu çalıştırın.

DROP TABLE IF EXISTS institution_event_participants;
DROP TABLE IF EXISTS institution_events;

CREATE TABLE institution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  event_time TIME,
  location TEXT,
  meeting_link TEXT,
  template_type TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institution_events_institution ON institution_events (institution_id, event_date DESC);

CREATE TABLE institution_event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES institution_events(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp_status TEXT NOT NULL DEFAULT 'pending',
  whatsapp_error TEXT,
  whatsapp_sent_at TIMESTAMPTZ,
  meta_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institution_event_participants_event ON institution_event_participants (event_id);

NOTIFY pgrst, 'reload schema';
