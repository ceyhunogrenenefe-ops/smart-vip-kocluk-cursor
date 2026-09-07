# Garanti BBVA Sanal POS entegrasyonu

Kart bilgisi sitede tutulmaz; veli Garanti ortak ödeme / 3D Secure sayfasında öder.

## Önemli (canlı Bonus POS)

Terminal **PROVOOS** + `3D_OOS_PAY` kullanır (PROVAUT / 3D_PAY değil).

## Kurulum — iki Vercel projesi

### A) Site (`onlinevipdershane1` → onlinevipdershane.com)
Zaten `GARANTI_*` tanımlı olmalı. Ek olarak `site-patches/onlinevipdershane1/api/` altındaki
`garanti-init.js`, `_lib/garanti.js`, `_lib/products.js` dosyalarını site reposuna kopyalayıp
deploy edin (`mode=raw_amount` + `kitapMagaza` için).

### B) Koçluk paneli (`smart-kocluk-ceyhu` → dersonlinevipkocluk.com)
Aynı `GARANTI_*` değerlerini **bu projeye de** ekleyin (Production + Preview), sonra Redeploy:

```text
GARANTI_MERCHANT_ID=...
GARANTI_TERMINAL_ID=...
GARANTI_PROVISION_USER=PROVOOS
GARANTI_PROVISION_PASSWORD=...   # PROVOOS şifresi
GARANTI_STORE_KEY=...
GARANTI_SECURITY_LEVEL=3D_OOS_PAY
GARANTI_MODE=prod
GARANTI_COMPANY_NAME=Online VIP Dershane
APP_PUBLIC_URL=https://www.dersonlinevipkocluk.com
```

1. Supabase SQL: `student-coaching-system/sql/2026-08-08-garanti-payment-orders.sql`
2. Muhasebe → ödeme linki veya `/kitap-odeme`

Panelde env yoksa form üretimi site `garanti-init` (raw_amount) üzerinden denenir;
site patch deploy edilmemişse yine hata alırsınız — panel env kopyası en güvenli yoldur.
