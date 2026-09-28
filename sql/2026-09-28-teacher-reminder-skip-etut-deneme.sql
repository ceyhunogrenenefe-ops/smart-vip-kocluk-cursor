-- Etüt ve deneme derslerinde öğretmen hatırlatması kapalı (uygulandı).
--
-- Bu derslere class_sessions.teacher_id yazılmıyor. Hatırlatma işi öğretmen
-- boşsa sınıfın öğretmenler listesinden İLK bulduğunu seçiyordu; altı
-- öğretmenli bir sınıfta o saatte dersi olmayan birine "dersiniz 10 dakika
-- sonra başlıyor" mesajı gidiyordu.
--
-- Artık: etüt / deneme / deneme analizi derslerinde hatırlatma gönderilmez,
-- ve sınıf öğretmeni yedeği yalnız TEK öğretmenli sınıflarda kullanılır.
alter table public.teacher_lesson_reminder_settings
  add column if not exists skip_etut_deneme boolean not null default true;
