-- Koç bazlı otomatik WhatsApp (Twilio) — şablon + saat + aralık + kampanya süresi

CREATE TABLE IF NOT EXISTS public.coach_whatsapp_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- coaches.id ile aynı tipte olmalı (birçok eski kurulumda coaches.id = text/uuid saklanır)
  coach_id text NOT NULL UNIQUE REFERENCES public.coaches(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  message_template text NOT NULL DEFAULT 'Merhaba {{name}}, {{coach}} olarak bugün çalışmalarını takip etmek istiyorum. İyi dersler!',
  send_hour_tr smallint NOT NULL DEFAULT 9 CHECK (send_hour_tr >= 0 AND send_hour_tr <= 23),
  send_minute_tr smallint NOT NULL DEFAULT 0 CHECK (send_minute_tr >= 0 AND send_minute_tr <= 59),
  weekdays_only boolean NOT NULL DEFAULT false,
  interval_days integer NOT NULL DEFAULT 1 CHECK (interval_days >= 1 AND interval_days <= 365),
  campaign_days integer CHECK (campaign_days IS NULL OR (campaign_days >= 1 AND campaign_days <= 3650)),
  campaign_started_at timestamptz,
  prefer_parent_phone boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_whatsapp_schedules_active ON public.coach_whatsapp_schedules(is_active);

COMMENT ON TABLE public.coach_whatsapp_schedules IS 'Koç otomatik Twilio WhatsApp zamanlayıcı (panel + cron/coach-whatsapp-auto)';

-- Gönderim tekilliği: aynı gün İstanbul tarihi + öğrenci + zamanlayıcı
CREATE TABLE IF NOT EXISTS public.coach_whatsapp_auto_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.coach_whatsapp_schedules(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reminder_date_tr date NOT NULL,
  kind text NOT NULL DEFAULT 'coach_auto_template',
  recipient_e164 text,
  body text,
  external_sid text,
  status text NOT NULL DEFAULT 'sent',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, student_id, reminder_date_tr, kind)
);

CREATE INDEX IF NOT EXISTS idx_coach_whatsapp_auto_log_date ON public.coach_whatsapp_auto_log(reminder_date_tr);

COMMENT ON TABLE public.coach_whatsapp_auto_log IS 'Koç zamanlayıcı WhatsApp günlük tekillik logu';
