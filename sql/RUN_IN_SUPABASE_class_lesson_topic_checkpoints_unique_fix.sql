-- FIX: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Tablo zaten varsa Supabase SQL Editor'da yalnızca bunu çalıştırın.
-- File: sql/2026-07-28-class-lesson-topic-checkpoints-session-unique.sql

drop index if exists public.uq_cltc_session_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'class_lesson_topic_checkpoints_class_session_id_key'
      and conrelid = 'public.class_lesson_topic_checkpoints'::regclass
  ) then
    alter table public.class_lesson_topic_checkpoints
      add constraint class_lesson_topic_checkpoints_class_session_id_key
      unique (class_session_id);
  end if;
end $$;

notify pgrst, 'reload schema';
