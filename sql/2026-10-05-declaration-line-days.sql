-- Grup dersinde gün gün işaretleme.
--
-- Öğretmen "8A 12 ders" demek yerine takvimden hangi günler ders yaptığını
-- işaretler; her gün için ders sayısı tutulur ve toplam quantity'ye yazılır.
-- Böylece beyan ile sistem kaydı gün bazında da karşılaştırılabilir.
--
-- Yalnız KOLON ekler. Mevcut satırlarda alan boş kalır ve eski davranış sürer.

alter table public.teacher_declaration_lines
  add column if not exists days jsonb;
