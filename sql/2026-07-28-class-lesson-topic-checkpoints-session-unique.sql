-- Oturum başına tek kayıt: partial index yerine UNIQUE (Supabase upsert / ON CONFLICT uyumu)
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
