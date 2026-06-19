-- Meta BM: kitap_siparisi1 · Turkish · 10 adlandırılmış parametre
UPDATE message_templates
SET
  name = 'kitap_siparisi1 (Meta)',
  content = E'📚 YENİ KİTAP SİPARİŞİ
Veli Ad Soyad:
{{veli_ad_soyad}}
Öğrenci Ad Soyad:
{{ogrenci_ad_soyad}}
Sınıf:
{{sinif}}
📦 Gönderilecek Kitap Seti:
{{kitap_seti}}
Ücret Durumu:
{{ucret_durumu}}
Telefon:
{{telefon}}
Adres:
{{adres}}
İlçe:
{{ilce}}
İl:
{{il}}
Sipariş Notu:
{{siparis_notu}}
────────────────────────
Online VIP Dershane tarafından oluşturulan kitap siparişidir.
Kargo işlemi tamamlandıktan sonra aşağıdaki bilgilerin paylaşılması rica olunur:
🚚 Kargo Firması:
🚚 Takip Numarası:
Teşekkür ederiz.
Online VIP Dershane',
  variables = '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","ucret_durumu","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  twilio_variable_bindings = '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","ucret_durumu","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  meta_template_name = 'kitap_siparisi1',
  meta_template_language = 'tr',
  meta_named_body_parameters = true,
  whatsapp_template_status = 'APPROVED',
  is_active = true,
  updated_at = NOW()
WHERE type = 'kitap_siparis_bildirim';

NOTIFY pgrst, 'reload schema';
