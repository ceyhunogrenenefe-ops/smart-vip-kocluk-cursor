-- Animasyon havuzu: dış link (NotebookLM vb.)
alter table public.edu_animation_pool
  add column if not exists external_url text,
  add column if not exists source_kind text not null default 'html';

alter table public.edu_animations
  add column if not exists external_url text,
  add column if not exists source_kind text not null default 'html';

comment on column public.edu_animation_pool.external_url is 'Dış içerik URL (NotebookLM, Canva vb.); storage_path launcher HTML tutabilir';
comment on column public.edu_animation_pool.source_kind is 'html | link';
