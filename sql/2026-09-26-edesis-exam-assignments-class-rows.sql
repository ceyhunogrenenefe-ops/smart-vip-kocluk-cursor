-- Edesis deneme atama: sınıf ataması yapısal olarak imkânsızdı.
--
--   edesis_exam_assignments_target_chk  →  target_type='class' ise student_id IS NULL
--   student_id                          →  NOT NULL
--
-- İki kural birbiriyle çelişiyordu; her sınıf ataması not-null ihlaliyle düşüyordu.
-- Hata mesajı "relation edesis_exam_assignments" içerdiği için kod bunu
-- "şema eksik" sanıp kullanıcıya "Vercel'e SUPABASE_DB_URL ekleyin" uyarısı
-- gösteriyor, asıl sebep hiç görünmüyordu.
--
-- Yalnızca kısıt gevşetilir: veri silinmez, kolon/tablo düşürülmez, mevcut
-- öğrenci atamaları etkilenmez. Idempotent.
alter table public.edesis_exam_assignments
  alter column student_id drop not null;

notify pgrst, 'reload schema';
