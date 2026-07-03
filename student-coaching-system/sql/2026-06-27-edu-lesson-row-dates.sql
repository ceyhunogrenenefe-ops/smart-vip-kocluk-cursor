-- EduPanel: konu erişim tarih aralığı (öğrenci ne zaman görebilir / bitirmeli)
alter table public.edu_lesson_rows
  add column if not exists available_from date,
  add column if not exists available_until date;

comment on column public.edu_lesson_rows.available_from is 'Konu+animasyon erişim başlangıcı (dahil). Boşsa lesson_date.';
comment on column public.edu_lesson_rows.available_until is 'Konu tamamlama son tarihi (dahil). Boşsa lesson_date.';

-- Mevcut satırlar: lesson_date ile doldur
update public.edu_lesson_rows
set
  available_from = coalesce(available_from, lesson_date),
  available_until = coalesce(available_until, lesson_date)
where available_from is null or available_until is null;
