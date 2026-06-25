-- Gateway şablonu: deneme sınavı tarih / saat / bağlantı ({{2}}, {{3}}, {{4}})

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS template_var_date text;

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS template_var_time text;

ALTER TABLE public.coach_whatsapp_gateway_schedules
  ADD COLUMN IF NOT EXISTS template_var_link text;

COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.template_var_date IS 'Şablonda {{2}} veya {{date}}';
COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.template_var_time IS 'Şablonda {{3}} veya {{time}}';
COMMENT ON COLUMN public.coach_whatsapp_gateway_schedules.template_var_link IS 'Şablonda {{4}} veya {{link}}';
