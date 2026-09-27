-- Öğretmen ders hatırlatması: gönderim hattı ve zamanlama ayarları (uygulandı).
--
-- İş zaten vardı (api/_lib/teacher-lesson-reminder-job.js) ama vercel.json'da
-- cron kaydı yoktu — handlers/cron-teacher-lesson-reminders.js ve route kaydı
-- duruyordu, sadece hiç tetiklenmiyordu. Ayrıca Meta API'den gönderiyordu,
-- oysa mesaj şablonu açıklaması bile "gateway cron" diyor.
--
-- Artık hat ve süre panelden ayarlanır:
--   Koç WhatsApp merkezi → Öğretmen ders hatırlatması
--
-- gateway_user_id, QR'ı okutan kullanıcının users.id değeridir; gönderim o
-- hattan çıkar. sender_phone yalnızca kayıt/doğrulama içindir (hangi numaradan
-- çıkması gerektiği), gönderimi kendisi belirlemez.
create table if not exists public.teacher_lesson_reminder_settings (
  id boolean primary key default true check (id),
  is_active boolean not null default true,
  channel text not null default 'gateway' check (channel in ('gateway', 'meta')),
  gateway_user_id text references public.users (id) on delete set null,
  sender_phone text,
  minutes_before integer not null default 10 check (minutes_before between 1 and 120),
  window_minutes integer not null default 2 check (window_minutes between 1 and 30),
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.teacher_lesson_reminder_settings enable row level security;

insert into public.teacher_lesson_reminder_settings
  (id, is_active, channel, sender_phone, minutes_before, window_minutes)
values (true, true, 'gateway', '05061877494', 10, 2)
on conflict (id) do nothing;
