-- Yoklamaya "İzinli" (excused) durumu eklendi.
-- "Geç" (late) arayüzde vardı ama CHECK kısıtı yüzünden kaydedilemiyordu; o da kabul ediliyor.
-- Üretimde 2026-09-16 tarihinde uygulandı.
ALTER TABLE public.class_session_attendance
  DROP CONSTRAINT IF EXISTS class_session_attendance_status_check;

ALTER TABLE public.class_session_attendance
  ADD CONSTRAINT class_session_attendance_status_check
  CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text]));

COMMENT ON COLUMN public.class_session_attendance.status IS
  'present = katıldı, late = geç katıldı, absent = katılmadı, excused = izinli (devamsızlık sayılmaz)';
