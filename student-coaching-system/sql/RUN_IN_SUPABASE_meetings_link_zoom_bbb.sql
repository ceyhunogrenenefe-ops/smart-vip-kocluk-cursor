-- =============================================================================
-- ZORUNLU: Zoom / BBB ile görüşme planlarken "link_bbb / link_zoom schema cache" hatası
-- Supabase → SQL Editor → Yeni sorgu → Tümünü yapıştır → Çalıştır (Run)
-- Ardından 1–2 dk bekleyin veya Project Settings → API → "Restart" / şema yenileme.
-- =============================================================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS link_zoom TEXT,
  ADD COLUMN IF NOT EXISTS link_bbb TEXT;

COMMENT ON COLUMN meetings.link_zoom IS 'Optional Zoom URL (in addition to Meet).';
COMMENT ON COLUMN meetings.link_bbb IS 'Optional BigBlueButton URL (in addition to Meet).';

-- PostgREST (Supabase API) şema önbelleğini yenile
NOTIFY pgrst, 'reload schema';
