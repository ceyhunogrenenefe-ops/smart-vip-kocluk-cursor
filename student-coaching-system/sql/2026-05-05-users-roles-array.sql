alter table if exists users
  add column if not exists roles jsonb;

update users
set roles = jsonb_build_array(role)
where roles is null or jsonb_typeof(roles) <> 'array' or jsonb_array_length(roles) = 0;

alter table if exists users
  alter column roles set default '["student"]'::jsonb;

create index if not exists users_roles_gin_idx on users using gin (roles);

notify pgrst, 'reload schema';
