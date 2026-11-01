-- Yönetici, yanlış öğretmen beyanını notla geri gönderebilsin.
-- Asıl dosya: student-coaching-system/sql/2026-11-01-teacher-declaration-correction.sql

ALTER TABLE public.teacher_month_declarations
  ADD COLUMN IF NOT EXISTS correction_note text;

ALTER TABLE public.teacher_declaration_messages
  DROP CONSTRAINT IF EXISTS teacher_declaration_messages_kind_check;

ALTER TABLE public.teacher_declaration_messages
  ADD CONSTRAINT teacher_declaration_messages_kind_check
  CHECK (kind IN ('initial', 'reminder', 'correction'));
