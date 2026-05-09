-- Gönderimde kullanılan Twilio Content (HX…) SID — Message SID'den ayrı tutulur.
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS twilio_content_sid TEXT;

COMMENT ON COLUMN message_logs.twilio_content_sid IS 'Twilio WhatsApp Content şablon SID (HX…); üretim şablon gönderiminde dolu.';

NOTIFY pgrst, 'reload schema';
