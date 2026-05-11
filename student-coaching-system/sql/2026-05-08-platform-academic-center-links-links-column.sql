-- platform_academic_center_links: links + payload (NOT NULL) uyumu
-- Eski satırda payload NULL ise NOT NULL kısıtı UPDATE/INSERT'i kırar; önce gevşetip dolduruyoruz.

CREATE TABLE IF NOT EXISTS platform_academic_center_links (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  links JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_academic_center_links
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE platform_academic_center_links
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE platform_academic_center_links
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Var olan NULL payload satırları: NOT NULL engelini kaldır → doldur → geri yükle
ALTER TABLE platform_academic_center_links
  ALTER COLUMN payload DROP NOT NULL;

UPDATE platform_academic_center_links
SET
  payload = COALESCE(payload, links, '{}'::jsonb),
  links = COALESCE(links, payload, '{}'::jsonb);

ALTER TABLE platform_academic_center_links
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb;

ALTER TABLE platform_academic_center_links
  ALTER COLUMN payload SET NOT NULL;

ALTER TABLE platform_academic_center_links
  ALTER COLUMN links SET DEFAULT '{}'::jsonb;

INSERT INTO platform_academic_center_links (id, links, payload)
VALUES (1, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  links = COALESCE(EXCLUDED.links, platform_academic_center_links.links, '{}'::jsonb),
  payload = COALESCE(EXCLUDED.payload, platform_academic_center_links.payload, EXCLUDED.links, '{}'::jsonb),
  updated_at = NOW();

COMMENT ON TABLE platform_academic_center_links IS 'Tek satır: Akademik Merkez harici linkleri (links JSON); payload ile aynı veri tutulabilir.';

NOTIFY pgrst, 'reload schema';
