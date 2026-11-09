-- Eğitim programları (Dönem Programı, Deneme Kulübü, Yaz Okulu, Kitap Okuma Atölyesi …)
-- Hiyerarşi: Program → Sınıf seviyesi (classes.class_level) → Şube/Grup (classes.name)
-- Öğrenci üyeliği mevcut class_students tablosu (çoka-çok) ile tutulur:
--   bir öğrenci birden fazla programın grubunda olabilir, students satırı değişmez.
--
-- NOT: Eski `programs` tablosu (ilkokul/lgs/tyt/ayt/yos) sınav alanıdır; ona dokunulmaz.
-- Supabase SQL Editor'de bir kez çalıştırın (idempotent).

create table if not exists public.edu_programs (
  id text primary key default gen_random_uuid()::text,
  institution_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_edu_programs_institution_name
  on public.edu_programs (institution_id, lower(name));

create index if not exists idx_edu_programs_institution
  on public.edu_programs (institution_id, sort_order);

alter table public.edu_programs enable row level security;

-- Sınıf (şube/grup) → program bağlantısı
alter table public.classes
  add column if not exists program_id text references public.edu_programs(id) on delete set null;

create index if not exists idx_classes_program_id on public.classes (program_id);

-- Aynı grup adı farklı programlarda / seviyelerde kullanılabilsin
-- (ör. Deneme Kulübü 8 «A Grubu» ve Kitap Okuma 5 «A Grubu»).
drop index if exists public.uq_classes_institution_name;
create unique index if not exists uq_classes_inst_program_level_name
  on public.classes (
    institution_id,
    coalesce(program_id, ''),
    lower(coalesce(class_level, '')),
    lower(name)
  );

-- Varsayılan programlar: her kurum için (varsa atlanır)
insert into public.edu_programs (institution_id, name, sort_order)
select i.id, p.name, p.sort_order
from public.institutions i
cross join (
  values
    ('Dönem Programı', 10),
    ('Deneme Kulübü', 20),
    ('Yaz Okulu', 30),
    ('Kitap Okuma Atölyesi', 40)
) as p(name, sort_order)
where not exists (
  select 1 from public.edu_programs e
  where e.institution_id = i.id and lower(e.name) = lower(p.name)
);

-- Mevcut sınıfları programlara yerleştir (yalnız programı boş olanlar).
-- Ada göre tahmin; eşleşmeyen her şey Dönem Programı. Sonradan sınıf düzenleme ekranından değiştirilebilir.
update public.classes c
set program_id = e.id
from public.edu_programs e
where c.program_id is null
  and c.institution_id is not null
  and e.institution_id = c.institution_id
  and lower(e.name) = lower(
    case
      when c.name ilike '%kitap%' then 'Kitap Okuma Atölyesi'
      when c.name ilike '%deneme%' then 'Deneme Kulübü'
      when c.name ilike '%yaz%' or c.name ilike '%kamp%' then 'Yaz Okulu'
      else 'Dönem Programı'
    end
  );

notify pgrst, 'reload schema';
