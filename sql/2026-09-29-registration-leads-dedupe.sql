-- Aynı kişi için ikinci lead açılmasını veritabanı seviyesinde engelle (uygulandı).
--
-- Sorun: uygulama "önce bak, yoksa ekle" yapıyordu. Aynı anda gelen iki webhook
-- kontrolü İKİSİ DE boş bulup ikisi de kayıt açıyordu — sahada 2–121 milisaniye
-- arayla açılmış 35 çift kayıt vardı. Konuşma yalnız birine bağlanıyor, diğeri
-- Pipeline'da görünüp Gelen Kutusu'nda görünmüyordu.
--
-- Temizlik (29.09.2026): 35 çift kayıt backup_cift_lead_20260929 tablosuna
-- yedeklendi, kanal mesajları ve konuşmaları kalan kayda taşındı, kendileri
-- soft-delete edildi. Hiçbir satır fiziksel olarak silinmedi.
--
-- KISMİ indeks: yalnız silinmemiş kayıtlar ve alan dolu olduğunda. Böylece
-- soft-delete edilmiş eski çiftler engel olmaz, alanı boş olan manuel kayıtlar
-- da etkilenmez.

create unique index if not exists registration_leads_instagram_unq
  on public.registration_leads (institution_id, instagram_scoped_id)
  where deleted_at is null and instagram_scoped_id is not null;

create unique index if not exists registration_leads_phone_unq
  on public.registration_leads (institution_id, normalized_phone)
  where deleted_at is null and normalized_phone is not null and normalized_phone <> '';

-- Not: kısıt yarışı kaybeden isteği reddeder. Bu bir hata değildir; kod tarafı
-- (registration-channel-ingest.js) 23505 aldığında mevcut kaydı bulup onu
-- kullanır — yoksa mesaj lead'siz kalırdı.
