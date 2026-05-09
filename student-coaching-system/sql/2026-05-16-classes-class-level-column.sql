-- classes tablosu class_level kolonu olmadan oluşturulduysa (create table if not exists eski yapıda kaldıysa),
-- PostgREST "could not find class_level column in schema cache" hatası verir.

alter table if exists classes
  add column if not exists class_level text null;

notify pgrst, 'reload schema';
