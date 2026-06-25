-- Kısa canlı ders davet kodları (WhatsApp uyumlu /d/xxxx linkleri)
CREATE TABLE IF NOT EXISTS guest_join_short_codes (
  code text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('class', 'private')),
  resource_id text NOT NULL,
  guest_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_join_short_codes_resource
  ON guest_join_short_codes (kind, resource_id);

CREATE INDEX IF NOT EXISTS idx_guest_join_short_codes_expires
  ON guest_join_short_codes (expires_at);

COMMENT ON TABLE guest_join_short_codes IS 'BBB misafir katılım — kısa /d/{code} URL → JWT token';
