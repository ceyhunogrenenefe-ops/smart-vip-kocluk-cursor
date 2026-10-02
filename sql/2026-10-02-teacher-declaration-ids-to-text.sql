-- Kimlik kolonlarını text'e çevirir.
--
-- Bu veritabanında users.id, students.id, institutions.id ve coaches.id
-- TEXT; yalnız classes.id uuid. Beyan ve hakediş ayar tabloları yanlışlıkla
-- uuid olarak açılmıştı. Sonuç: kimliği "user-1777..." biçiminde olan
-- kullanıcıda ayar kaydetmek 500 veriyordu ve böyle bir öğretmen beyan
-- listesine hiç giremiyordu.
--
-- uuid -> text genişletmedir: mevcut değerler aynen korunur, veri kaybı yok.

alter table public.teacher_month_declarations
  alter column teacher_id type text using teacher_id::text,
  alter column institution_id type text using institution_id::text,
  alter column edit_allowed_by type text using edit_allowed_by::text;

alter table public.teacher_declaration_lines
  alter column student_id type text using student_id::text;

alter table public.teacher_declaration_settings
  alter column updated_by type text using updated_by::text;

alter table public.teacher_payroll_settings
  alter column updated_by type text using updated_by::text;
