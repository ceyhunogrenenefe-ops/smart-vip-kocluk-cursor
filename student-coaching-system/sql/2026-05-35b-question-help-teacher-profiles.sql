-- Öğretmen branş eşlemesi — Soru Sor modülü
-- Supabase SQL Editor'da çalıştırın (additive, mevcut tabloları silmez).
--
-- Amaç: Yeni soru bildirimi ve havuz filtresi yalnızca ilgili branştaki öğretmenlere gitsin.
-- branches dizisindeki metinler, uygulamadaki ders adlarıyla BİREBİR aynı olmalıdır.

-- ---------------------------------------------------------------------------
-- 1) Branş kataloğu (referans — Table Editor'da seçim kolaylığı)
-- ---------------------------------------------------------------------------
create table if not exists public.question_help_branch_catalog (
  id serial primary key,
  name text not null unique,
  sort_order int not null default 0
);

insert into public.question_help_branch_catalog (name, sort_order)
values
  ('Matematik', 10),
  ('Türkçe', 20),
  ('Geometri', 30),
  ('Fen Bilimleri', 40),
  ('Fizik', 50),
  ('Kimya', 60),
  ('Biyoloji', 70),
  ('Sosyal Bilgiler', 80),
  ('Tarih', 90),
  ('Coğrafya', 100),
  ('Edebiyat', 110),
  ('Felsefe', 120),
  ('İngilizce', 130),
  ('İnkılap Tarihi', 140),
  ('Din Kültürü', 150),
  ('Hayat Bilgisi', 160)
on conflict (name) do nothing;

comment on table public.question_help_branch_catalog is
  'Soru Sor — geçerli branş adları (questions.subject ile eşleşmeli)';

-- ---------------------------------------------------------------------------
-- 2) Öğretmen profili (bir öğretmen = bir satır, birden fazla branş: text[])
-- ---------------------------------------------------------------------------
create table if not exists public.question_help_teacher_profiles (
  user_id text primary key references public.users (id) on delete cascade,
  institution_id text references public.institutions (id) on delete set null,
  branches text[] not null default '{}',
  grades text[] not null default '{}',
  notify_whatsapp boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_qhtp_institution
  on public.question_help_teacher_profiles (institution_id);

create index if not exists idx_qhtp_branches_gin
  on public.question_help_teacher_profiles using gin (branches);

alter table public.question_help_teacher_profiles
  add column if not exists notes text;

comment on table public.question_help_teacher_profiles is
  'Öğretmen–branş eşlemesi. branches örn: {Matematik,Geometri}';
comment on column public.question_help_teacher_profiles.user_id is
  'users.id — role teacher veya coach+öğretmen görevi olan kullanıcı';
comment on column public.question_help_teacher_profiles.branches is
  'question_help_branch_catalog.name ile birebir aynı yazım (Türkçe karakterler dahil)';
comment on column public.question_help_teacher_profiles.institution_id is
  'Kurum filtresi; boş bırakılırsa tüm kurumlardaki o branş soruları görülebilir (API kurum kısıtı varsa institution_id doldurun)';

-- updated_at otomatik
create or replace function public.set_question_help_teacher_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_qhtp_updated_at on public.question_help_teacher_profiles;
create trigger trg_qhtp_updated_at
  before update on public.question_help_teacher_profiles
  for each row execute function public.set_question_help_teacher_profile_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Yönetim görünümü — öğretmenleri ve branşlarını listelemek için
-- ---------------------------------------------------------------------------
create or replace view public.v_question_help_teacher_profiles as
select
  p.user_id,
  u.name as user_name,
  u.email,
  u.phone,
  u.role,
  p.institution_id,
  i.name as institution_name,
  p.branches,
  array_length(p.branches, 1) as branch_count,
  p.notify_whatsapp,
  p.notes,
  p.updated_at
from public.question_help_teacher_profiles p
join public.users u on u.id = p.user_id
left join public.institutions i on i.id = p.institution_id;

comment on view public.v_question_help_teacher_profiles is
  'Supabase Table Editor / raporlama için öğretmen branş özeti';

-- Branşı tanımlı olmayan öğretmenler (bildirim fallback alır)
create or replace view public.v_question_help_teachers_missing_profile as
select
  u.id as user_id,
  u.name as user_name,
  u.email,
  u.phone,
  u.role,
  u.institution_id
from public.users u
where lower(coalesce(u.role, '')) in ('teacher', 'öğretmen', 'ogretmen')
  and not exists (
    select 1
    from public.question_help_teacher_profiles p
    where p.user_id = u.id
      and coalesce(array_length(p.branches, 1), 0) > 0
  );

-- ---------------------------------------------------------------------------
-- 4) RLS (istemci doğrudan yazmasın; API service role kullanır)
-- ---------------------------------------------------------------------------
alter table public.question_help_teacher_profiles enable row level security;
alter table public.question_help_branch_catalog enable row level security;

-- ---------------------------------------------------------------------------
-- 5) ÖRNEK KAYITLAR — user_id ve institution_id değerlerini kendinizle değiştirin
-- ---------------------------------------------------------------------------
--
-- Önce öğretmen user id bulun:
--   select id, name, email, role, institution_id from users where role ilike '%teacher%';
--
-- Tek branş:
-- insert into public.question_help_teacher_profiles (user_id, institution_id, branches, notes)
-- values (
--   'USER_ID_BURAYA',
--   'KURUM_ID_BURAYA',  -- veya null
--   array['Matematik'],
--   'Ana branş matematik'
-- )
-- on conflict (user_id) do update set
--   institution_id = excluded.institution_id,
--   branches = excluded.branches,
--   notes = excluded.notes,
--   updated_at = now();
--
-- Çoklu branş (TYT/AYT matematik + geometri):
-- insert into public.question_help_teacher_profiles (user_id, institution_id, branches)
-- values (
--   'USER_ID_BURAYA',
--   'KURUM_ID_BURAYA',
--   array['Matematik', 'Geometri']
-- )
-- on conflict (user_id) do update set
--   branches = excluded.branches,
--   updated_at = now();
--
-- Branş ekleme (mevcut diziye):
-- update public.question_help_teacher_profiles
-- set branches = array(select distinct unnest(branches || array['Fizik']))
-- where user_id = 'USER_ID_BURAYA';
--
-- Branş kaldırma:
-- update public.question_help_teacher_profiles
-- set branches = array_remove(branches, 'Fizik')
-- where user_id = 'USER_ID_BURAYA';

-- ---------------------------------------------------------------------------
-- 6) İsteğe bağlı: Tüm öğretmenlere tek seferde boş profil (sonra branches doldurun)
-- ---------------------------------------------------------------------------
-- insert into public.question_help_teacher_profiles (user_id, institution_id, branches)
-- select u.id, u.institution_id, '{}'::text[]
-- from public.users u
-- where lower(coalesce(u.role, '')) in ('teacher', 'öğretmen')
-- on conflict (user_id) do nothing;
