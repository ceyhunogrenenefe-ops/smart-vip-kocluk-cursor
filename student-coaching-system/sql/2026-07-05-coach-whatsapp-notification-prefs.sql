-- Koç WhatsApp bildirim tercihleri (günlük rapor vb.)
-- coaches.id = text (Smart Koçluk şeması ile uyumlu)
CREATE TABLE IF NOT EXISTS coach_whatsapp_notification_prefs (
  coach_id text PRIMARY KEY REFERENCES public.coaches(id) ON DELETE CASCADE,
  daily_report_enabled boolean NOT NULL DEFAULT true,
  daily_report_scope text NOT NULL DEFAULT 'all',
  gateway_last_connected_at timestamptz,
  gateway_disconnect_notified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_whatsapp_notification_prefs IS 'Koç bazlı WhatsApp otomasyon tercihleri';
COMMENT ON COLUMN coach_whatsapp_notification_prefs.daily_report_scope IS 'all | none — ileride student bazlı genişletilebilir';

CREATE INDEX IF NOT EXISTS idx_coach_wa_prefs_updated ON coach_whatsapp_notification_prefs(updated_at DESC);
