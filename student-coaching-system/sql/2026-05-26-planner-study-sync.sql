-- Haftalik plan <-> gunluk kayit senkronu: koc hedef tarih araligi, ek alanlar, study_logs gorunumu
-- Supabase SQL Editor: tum dosyayi secip tek seferde calistirin (parcali secim hataya yol acar).

alter table if exists public.coach_weekly_goals
  add column if not exists goal_start_date date,
  add column if not exists goal_end_date date;

comment on column public.coach_weekly_goals.goal_start_date is 'Hedef baslangic (or. gorusme gunu); bossa week_start_date kullanilir.';
comment on column public.coach_weekly_goals.goal_end_date is 'Hedef bitis; bossa haftanin son gunu varsayilir.';

update public.coach_weekly_goals
set
  goal_start_date = coalesce(goal_start_date, week_start_date),
  goal_end_date = coalesce(goal_end_date, week_start_date + interval '6 day')
where goal_start_date is null or goal_end_date is null;

alter table if exists public.weekly_entries
  add column if not exists pages_read integer,
  add column if not exists screen_time_minutes integer;

comment on column public.weekly_entries.pages_read is 'Kitap: okunan sayfa sayisi (sure degil).';
comment on column public.weekly_entries.reading_minutes is 'Geri donuk: bazi kurulumlarda sayfa olarak kullanilmis; yeni kayitta pages_read tercih edilir.';
comment on column public.weekly_entries.screen_time_minutes is 'Oturum kaydindaki telefon/tablet ekran suresi (dakika).';

drop view if exists public.study_logs;

create view public.study_logs as
select
  we.id,
  we.student_id,
  wpe.id as weekly_plan_item_id,
  we.date::date as study_date,
  we.subject,
  we.topic,
  we.target_questions,
  we.solved_questions,
  we.correct,
  we.wrong,
  we.blank,
  coalesce(we.pages_read, we.reading_minutes) as pages_read_effective,
  we.screen_time_minutes,
  we.book_title,
  we.notes,
  we.institution_id,
  we.created_at,
  we.updated_at
from public.weekly_entries we
left join public.weekly_planner_entries wpe on wpe.weekly_entry_id = we.id;

comment on view public.study_logs is 'Gunluk calisma kaydi (weekly_entries); weekly_plan_item ile plan blok baglantisi.';

select pg_notify('pgrst', 'reload schema');
