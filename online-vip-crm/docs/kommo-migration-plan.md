# Kommo Migrasyon Planı

## Altın kural

**Kommo’yu otomatik disconnect etmeyin.** Canlı WhatsApp / Instagram / Messenger trafiği kesilirse kayıt ve veli iletişimi durur. Hiçbir script, cron veya “tek tık migrate” Kommo bağlantısını koparmamalıdır.

## Hedef

Online VIP CRM’i Kommo’nun yerine kademeli olarak koymak; veri ve kanal sürekliliğini korumak.

## Fazlar

### 1) Paralel okuma (risk: düşük)

- CRM’de demo / test numarası ve test Page
- Kommo aynen çalışır
- Form lead’leri isteğe bağlı CRM’e de yazılır (çift yazım)

### 2) Veri envanteri

- Kommo export: kontaklar, deal’ler, notlar, etiketler
- Alan eşlemesi → `contacts`, `leads`, `pipelines`
- Tarihçe mesaj import **opsiyonel**; yasal saklama + kalite kontrolü gerekir

### 3) Soft cutover (kanal kanal)

Sıra önerisi:

1. Website form → CRM (Kommo form kapatılır)
2. E-posta
3. Facebook / Instagram (düşük hacim saat)
4. WhatsApp Cloud numarası (en kritik — bakım penceresi)

Her adımda rollback: trafik eski tüketiciye döner.

### 4) Hard cutover

- Meta webhook subscription tek consumer: CRM
- Kommo entegrasyonu **manuel** kapatılır (insan onayı + checklist)
- 48–72 saat war-room izleme

### 5) Kommo read-only / kapatma

- Sözleşme bitimine kadar arşiv erişimi
- CRM tek sistem of record

## Yasak listesi

- Otomatik Kommo API “uninstall / revoke”
- Prod numarayı test etmeden CRM’e bağlamak
- Coaching sisteminden “hızlı veri kopyala” script’leri
- Cutover sırasında verify token’ı rastgele değiştirmek

## Rollback tetikleri

- Outbound fail oranı eşiği
- Webhook ACK timeout
- Personel “mesaj gelmiyor” eskalasyonu

Rollback sahibi: operasyon + teknik lead (isimler runbook’ta).

## Başarı kriterleri

- [ ] 7 gün boyunca kanal uptime ≥ hedef
- [ ] Lead kaybı yok (form + WA)
- [ ] Tenant izolasyon smoke test geçti
- [ ] KVKK bildirim / rıza akışı doğrulandı
