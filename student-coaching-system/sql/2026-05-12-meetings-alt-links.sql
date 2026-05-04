-- Görüşme: Google Meet yanında isteğe bağlı Zoom / BBB bağlantıları
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS link_zoom TEXT,
  ADD COLUMN IF NOT EXISTS link_bbb TEXT;

COMMENT ON COLUMN meetings.link_zoom IS 'İsteğe bağlı Zoom toplantı URL’si (Google Meet’e ek).';
COMMENT ON COLUMN meetings.link_bbb IS 'İsteğe bağlı BigBlueButton toplantı URL’si (Google Meet’e ek).';

NOTIFY pgrst, 'reload schema';
