-- Yönetici, yanlış öğretmen beyanını notla geri gönderebilsin.
-- Mesaj kaydında yeni tür: correction

ALTER TABLE public.teacher_month_declarations
  ADD COLUMN IF NOT EXISTS correction_note text;

COMMENT ON COLUMN public.teacher_month_declarations.correction_note IS
  'Yönetici düzeltme notu — öğretmen formu yeniden açıldığında görür';

ALTER TABLE public.teacher_declaration_messages
  DROP CONSTRAINT IF EXISTS teacher_declaration_messages_kind_check;

ALTER TABLE public.teacher_declaration_messages
  ADD CONSTRAINT teacher_declaration_messages_kind_check
  CHECK (kind IN ('initial', 'reminder', 'correction'));
