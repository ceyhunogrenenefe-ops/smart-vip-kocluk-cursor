-- Konu takibi / Analizlerim: 9. sınıf görünen kayıtları 10. sınıfa çeker.
-- Begüm Keyif, Ayşe Naz Başarslan (Türkçe karakter / yazım varyantları).
-- Supabase SQL Editor veya psql ile çalıştırın. Önce bölüm (1), sonra (2).

-- (1) Etkilenecek satırları doğrula
select id, name, email, class_level, program_id, user_id, institution_id, updated_at
from public.students
where
  (name ilike '%begüm%' and name ilike '%keyif%')
  or (
    name ilike '%ayşe%'
    and name ilike '%naz%'
    and (
      name ilike '%başarslan%'
      or name ilike '%basarslan%'
    )
  );

-- (2) Sınıfı 10 yap (yalnızca 9 / 09 kayıtları; zaten 10 ise güncellenmez)
update public.students
set
  class_level = '10',
  program_id = coalesce(program_id, 'tyt'),
  updated_at = now()
where
  (
    (name ilike '%begüm%' and name ilike '%keyif%')
    or (
      name ilike '%ayşe%'
      and name ilike '%naz%'
      and (
        name ilike '%başarslan%'
        or name ilike '%basarslan%'
      )
    )
  )
  and (
    lower(btrim(class_level::text)) in ('9', '09')
    or (class_level::text ~ '^[0-9]+$' and (class_level::text)::int = 9)
  );

-- program_id kolonu şemanızda yoksa yukarıdaki UPDATE içinde program_id satırını kaldırın.

-- (3) Aynı e-posta + kurumda birden fazla students (inceleme; yanlış kart birleştirme için)
select institution_id, lower(btrim(email)) as em, count(*) as n,
       array_agg(id order by updated_at desc nulls last) as ids,
       array_agg(class_level order by updated_at desc nulls last) as levels
from public.students
where coalesce(btrim(email), '') <> ''
group by institution_id, lower(btrim(email))
having count(*) > 1;
