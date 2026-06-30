-- Öğrencinin bir sınıfta hangi derslere kayıtlı olduğu (boş = tüm dersler — geriye uyumlu)
ALTER TABLE IF EXISTS class_students
  ADD COLUMN IF NOT EXISTS subjects jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN class_students.subjects IS 'Grup canlı ders: öğrencinin bu sınıfta aldığı ders adları. Boş dizi = sınıftaki tüm dersler.';
