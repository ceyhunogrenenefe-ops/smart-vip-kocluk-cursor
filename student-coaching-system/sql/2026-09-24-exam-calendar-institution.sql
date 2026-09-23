-- Deneme sınav takvimi kurum bazlı olsun (2026-09-24).
-- Geriye uyumlu: sütun eklenir, mevcut satırlar platform kurumuna damgalanır, veri silinmez.
-- Üretimde uygulandı (117 satır Online VIP kurumuna damgalandı).

alter table public.exam_calendar add column if not exists institution_id text;

update public.exam_calendar
   set institution_id = '73323d75-eea1-4552-8bba-d50555423589'
 where institution_id is null;

create index if not exists exam_calendar_institution_idx
    on public.exam_calendar (institution_id, level, exam_date);
