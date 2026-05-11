-- Platform geneli: Akademik Merkez (etüt / deneme / optik / soru havuzu) harici URL'leri

CREATE TABLE IF NOT EXISTS platform_academic_center_links (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  links JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_academic_center_links (id, links)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE platform_academic_center_links IS 'Tek satır: Akademik Merkez harici linkleri (links JSON).';

NOTIFY pgrst, 'reload schema';
