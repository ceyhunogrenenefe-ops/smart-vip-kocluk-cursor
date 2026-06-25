-- guest_join_short_codes.resource_id → text (uuid/string uyumu)
ALTER TABLE IF EXISTS guest_join_short_codes
  ALTER COLUMN resource_id TYPE text USING resource_id::text;

NOTIFY pgrst, 'reload schema';
