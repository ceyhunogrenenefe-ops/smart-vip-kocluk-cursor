-- Ödev modülü genişletme: özel öğrenci atama, çoklu animasyon, hatırlatma bayrakları
-- Mevcut kolonlar / akışlar korunur; yeni alanlar geriye dönük uyumludur.

alter table public.edu_homework
  add column if not exists assignee_mode text not null default 'class';

alter table public.edu_homework
  add column if not exists assignee_student_ids jsonb not null default '[]'::jsonb;

alter table public.edu_homework
  add column if not exists pool_animation_ids jsonb not null default '[]'::jsonb;

alter table public.edu_homework
  add column if not exists remind_24h_sent_at timestamptz;

alter table public.edu_homework
  add column if not exists remind_due_sent_at timestamptz;

alter table public.edu_homework
  add column if not exists overdue_teacher_notified_at timestamptz;

comment on column public.edu_homework.assignee_mode is 'class | students — sınıf veya seçili öğrencilere ödev';
comment on column public.edu_homework.assignee_student_ids is 'assignee_mode=students iken students.id listesi';
comment on column public.edu_homework.pool_animation_ids is 'Ödeve bağlı animasyon havuzu id listesi (çoklu)';

-- Eski tekil pool_animation_id → pool_animation_ids senkronu
update public.edu_homework h
set pool_animation_ids = jsonb_build_array(h.pool_animation_id)
where h.pool_animation_id is not null
  and (
    h.pool_animation_ids is null
    or h.pool_animation_ids = '[]'::jsonb
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'edu_homework_assignee_mode_check'
  ) then
    alter table public.edu_homework
      add constraint edu_homework_assignee_mode_check
      check (assignee_mode in ('class', 'students'));
  end if;
end $$;
