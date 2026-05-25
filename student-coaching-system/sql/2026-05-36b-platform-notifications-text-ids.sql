-- platform_notifications: users.id bu projede TEXT — UUID sütunları 500 hatasına yol açar.
-- Daha önce 2026-05-36 dosyasını çalıştırdıysanız bu dosyayı da Supabase SQL Editor'da çalıştırın.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'platform_notifications'
  ) then
    alter table public.platform_notifications
      alter column sender_user_id type text using sender_user_id::text;
    alter table public.platform_notifications
      alter column target_user_id type text using target_user_id::text;
    alter table public.platform_notifications
      alter column institution_id type text using institution_id::text;
    alter table public.platform_notifications
      alter column target_institution_id type text using target_institution_id::text;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'platform_notification_reads'
  ) then
    alter table public.platform_notification_reads
      alter column user_id type text using user_id::text;
  end if;
end $$;
