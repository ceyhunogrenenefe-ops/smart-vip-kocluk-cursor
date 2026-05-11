-- Grup dersi yoklama: "geç katıldı" + kurum bazlı otomatik WhatsApp (devamsızlık) tercihi

DO $$
BEGIN
  ALTER TABLE class_session_attendance DROP CONSTRAINT IF EXISTS class_session_attendance_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE class_session_attendance
  ADD CONSTRAINT class_session_attendance_status_check
  CHECK (status IN ('present', 'absent', 'late'));

CREATE TABLE IF NOT EXISTS attendance_institution_prefs (
  institution_id text PRIMARY KEY,
  auto_whatsapp_absent boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_prefs_institution ON attendance_institution_prefs (institution_id);

NOTIFY pgrst, 'reload schema';
