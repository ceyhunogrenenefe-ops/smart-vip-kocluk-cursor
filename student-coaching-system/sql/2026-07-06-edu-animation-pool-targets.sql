-- Animasyon Havuzu — birden fazla sınıf / program hedefi
alter table public.edu_animation_pool
  add column if not exists targets jsonb not null default '[]'::jsonb;

update public.edu_animation_pool
set targets = jsonb_build_array(
  jsonb_build_object('program', program, 'class_level', class_level)
)
where targets = '[]'::jsonb
   or targets is null;

create index if not exists idx_edu_animation_pool_targets
  on public.edu_animation_pool using gin (targets);
