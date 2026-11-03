-- Deneme takvimi: 3–7 ve LGS kademeleri (kod EXAM_CALENDAR_LEVELS ile aynı).
-- Önceki kısıt yalnız 9/10/11/yks'ye izin veriyordu; bu kademeler girilemiyordu.
-- Supabase'e 2026-11-03'te uygulandı.
alter table public.exam_calendar drop constraint if exists exam_calendar_level_check;
alter table public.exam_calendar add constraint exam_calendar_level_check
  check (level in ('3','4','5','6','7','lgs','9','10','11','yks'));
