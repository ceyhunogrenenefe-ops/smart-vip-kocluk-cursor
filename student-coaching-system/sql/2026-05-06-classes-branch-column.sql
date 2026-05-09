-- Grup ders sınıfları için şube (öğrenci kaydındaki `school` ile eşleştirilir)
alter table if exists classes
  add column if not exists branch text null;

notify pgrst, 'reload schema';
