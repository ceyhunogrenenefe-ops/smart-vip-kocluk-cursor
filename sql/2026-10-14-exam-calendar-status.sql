-- Deneme sınav takvimi: sınav gerçekleşme durumu
--
-- GERİYE UYUMLU: sütun nullable ve varsayılansız eklenir. Mevcut 117
-- kayıt olduğu gibi kalır, hiçbir satır silinmez veya güncellenmez.
--
-- NULL = "yönetici işaretlemedi" demektir, "yapılmadı" demek değildir.
-- Etkin durum uygulamada hesaplanır:
--   status dolu          -> o değer
--   status NULL, tarih ileride -> planlandi
--   status NULL, tarih geçmiş  -> yapilmadi
-- Tarihi geçen sınav ASLA kendiliğinden "yapildi" sayılmaz; gerçekleşme
-- yalnızca yöneticinin işaretlemesiyle belirlenir.

alter table public.exam_calendar
  add column if not exists status text;

alter table public.exam_calendar
  add column if not exists status_updated_at timestamptz;

alter table public.exam_calendar
  add column if not exists status_updated_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exam_calendar_status_chk'
  ) then
    alter table public.exam_calendar
      add constraint exam_calendar_status_chk
      check (status is null or status in ('yapildi', 'yapilmadi', 'planlandi'));
  end if;
end $$;

-- Durum filtresi sınıf ve tarihle birlikte kullanılıyor
create index if not exists exam_calendar_status_idx
  on public.exam_calendar (institution_id, status);
