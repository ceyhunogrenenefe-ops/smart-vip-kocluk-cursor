# KVKK Checklist

Online VIP CRM veli / öğrenci iletişim verisi işler. Türkiye KVKK uyumu için minimum kontrol listesi:

## Hukuki temel

- [ ] Aydınlatma metni (web + form + WhatsApp ilk temas)
- [ ] Açık rıza gereken işleme faaliyetleri ayrıştırıldı
- [ ] İşleyen / veri sorumlusu rolleri net (Online VIP Dershane)
- [ ] Alt işleyen sözleşmeleri (hosting, Meta, e-posta, S3)

## Veri minimizasyonu

- [ ] Webhook payload minimize / mask
- [ ] Log’larda telefon / mesaj içeriği yok veya maskeli
- [ ] Gereksiz alan toplanmıyor (form alan gözden geçirme)

## Haklar

- [ ] Erişim / düzeltme süreci tanımlı
- [ ] Silme / anonimleştirme prosedürü (`deleted_at` + hard-delete runbook)
- [ ] İtiraz / iletişim tercihi (opt-out) `consent_records` ile izlenir

## Güvenlik tedbirleri

- [ ] Erişim yetkisi role dayalı
- [ ] Encryption at rest (DB / disk) ve credential encryption
- [ ] Audit log kritik işlemlerde
- [ ] Oturum timeout / parola politikası

## Saklama

- [ ] `data_retention_policies` kurum bazlı süreler
- [ ] Mesaj / lead / dosya retention job planı
- [ ] Yedeklerden silme prosedürü belgelendi

## Aktarım

- [ ] Meta (ABD) aktarımı için aydınlatma + uygun mekanizma değerlendirmesi
- [ ] S3 bölgesi seçimi dokümante

## İç süreç

- [ ] İhlal bildirim runbook (72 saat farkındalığı)
- [ ] Personel KVKK eğitimi (kayıt / rehber rolleri)
- [ ] Demo ortamında gerçek veli verisi yok

Bu liste hukuki tavsiye yerine geçmez; danışman onayı ile güncellenir.
