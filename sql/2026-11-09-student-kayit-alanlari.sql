-- Koçluk kayıt formu: seçilen program, T.C. ve adres öğrenci kartında kalsın.
alter table if exists public.students
  add column if not exists tc_identity_no text,
  add column if not exists address text,
  add column if not exists enrolled_program text;

notify pgrst, 'reload schema';
