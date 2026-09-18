-- FAZ 5: hazır mesaj şablonları (serbest metin; temsilci düzenleyip kendisi gönderir)
create table if not exists public.crm_canned_replies (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  category text not null default 'Genel',
  title text not null,
  body text not null,
  channel text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_canned_replies_inst_idx on public.crm_canned_replies (institution_id, is_active, category, sort_order);
alter table public.crm_canned_replies enable row level security;

-- Başlangıç şablonları (yönetici düzenler / siler). {ad} = kişi adı, {temsilci} = gönderen temsilci
insert into public.crm_canned_replies (institution_id, category, title, body, sort_order)
select '73323d75-eea1-4552-8bba-d50555423589', c, t, b, o
from (values
  ('Genel', 'Karşılama', 'Merhaba {ad}, Online VIP Dershane''ye hoş geldiniz. Ben {temsilci}. Öğrencimiz kaçıncı sınıfta ve hangi konuda destek arıyorsunuz?', 10),
  ('LGS', 'LGS programı', 'Merhaba {ad}, LGS programımızda haftalık canlı dersler, deneme sınavları ve birebir eğitim koçluğu yer alıyor. Öğrencimizin şu anki net durumunu paylaşırsanız size uygun programı önerebilirim.', 20),
  ('5. Sınıf', '5. sınıf programı', 'Merhaba {ad}, 5. sınıf programımız temel derslerde konu anlatımı, ödev takibi ve koçluk desteğinden oluşuyor. Size detaylı programı iletmemi ister misiniz?', 30),
  ('6. Sınıf', '6. sınıf programı', 'Merhaba {ad}, 6. sınıf programımızda canlı dersler, haftalık takip ve deneme uygulamaları var. Öğrencimizin hangi derslerde desteğe ihtiyacı var?', 40),
  ('7. Sınıf', '7. sınıf programı', 'Merhaba {ad}, 7. sınıf programımız LGS''ye hazırlığın temelini atıyor: canlı dersler, deneme kulübü ve koçluk. Detaylı programı paylaşayım mı?', 50),
  ('Özel Ders', 'Özel ders bilgisi', 'Merhaba {ad}, birebir özel derslerimiz online ve öğrencinin ihtiyacına göre planlanıyor. Hangi ders ve kaç saat düşünüyorsunuz?', 60),
  ('Eğitim Koçluğu', 'Eğitim koçluğu', 'Merhaba {ad}, eğitim koçluğunda öğrencimize haftalık plan hazırlıyor, günlük çalışmasını ve deneme sonuçlarını takip ediyoruz. Ücretsiz tanışma görüşmesi planlayalım mı?', 70),
  ('Deneme Kulübü', 'Deneme kulübü', 'Merhaba {ad}, deneme kulübümüzde düzenli Türkiye geneli denemeler, hata karnesi ve analiz raporu sunuyoruz. Katılım detaylarını iletmemi ister misiniz?', 80),
  ('Fiyat Bilgisi', 'Fiyat bilgisi', 'Merhaba {ad}, program ücretimiz ve ödeme seçenekleri öğrencinin sınıfına ve seçilen pakete göre değişiyor. Size özel teklifi hazırlamam için sınıf ve paket tercihinizi paylaşır mısınız?', 90),
  ('Program Bilgisi', 'Program detayı', 'Merhaba {ad}, programımızın haftalık ders saatlerini ve içeriğini aşağıda paylaşıyorum. Sorunuz olursa buradayım.', 100),
  ('Kayıt', 'Kayıt adımları', 'Merhaba {ad}, kaydı tamamlamak için öğrenci adı-soyadı, sınıfı ve veli bilgilerini iletmeniz yeterli. Ardından veli onay ve sözleşme bağlantısını gönderiyoruz.', 110),
  ('Ödeme', 'Ödeme bilgisi', 'Merhaba {ad}, ödemenizi kredi kartı veya havale ile yapabilirsiniz. Taksit seçeneklerini de iletebilirim. Hangisini tercih edersiniz?', 120),
  ('Düşünecek', 'Düşünecek takibi', 'Merhaba {ad}, geçen görüşmemizi hatırlatmak istedim. Aklınıza takılan bir soru varsa memnuniyetle yardımcı olurum.', 130),
  ('Eşiyle Görüşecek', 'Eşiyle görüşme takibi', 'Merhaba {ad}, eşinizle görüşme fırsatınız oldu mu? Birlikte sorularınızı yanıtlamak için kısa bir görüşme ayarlayabiliriz.', 140),
  ('Cevap Vermeyen', 'Cevap vermeyen', 'Merhaba {ad}, size ulaşmaya çalıştık. Uygun olduğunuz bir saati yazarsanız sizi arayalım.', 150)
) as v(c, t, b, o)
where not exists (select 1 from public.crm_canned_replies);
