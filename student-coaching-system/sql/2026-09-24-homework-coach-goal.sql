-- Ödev, haftalık planın sol panelinde hedef kartı olarak çıksın (2026-09-24).
-- Üretimde uygulandı. Geriye uyumlu: yalnız sütun ve indeks eklenir.

alter table public.coach_weekly_goals
  add column if not exists homework_id uuid;

create unique index if not exists coach_weekly_goals_homework_student_key
    on public.coach_weekly_goals (student_id, homework_id)
 where homework_id is not null;
