# Garanti BBVA Sanal POS entegrasyonu

Kart bilgisi sitede tutulmaz; veli Garanti ortak ödeme / 3D Secure sayfasında öder.

## Kurulum

1. Supabase SQL Editor’de çalıştırın:
   `student-coaching-system/sql/2026-08-08-garanti-payment-orders.sql`
2. Vercel → Environment Variables (Production + Preview):

```text
GARANTI_MERCHANT_ID=...
GARANTI_TERMINAL_ID=...
GARANTI_PROVISION_USER=PROVAUT
GARANTI_PROVISION_PASSWORD=...
GARANTI_STORE_KEY=...
GARANTI_MODE=prod
GARANTI_COMPANY_NAME=Online VIP Dershane
APP_PUBLIC_URL=https://www.onlinevipdershane.com
```

3. Deploy sonrası Muhasebe → Öğrenci ödeme takip satırında link ikonundan ödeme linki üretin.
4. Link formatı: `https://www.onlinevipdershane.com/odeme/{token}`

## API

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/garanti-pos` | Admin: link oluştur |
| GET | `/api/garanti-pos` | Admin: son siparişler |
| GET | `/api/garanti-pos/public?token=` | Kamu özet |
| POST | `/api/garanti-pos/start` | Form alanları + gateway URL |
| POST | `/api/garanti-pos/callback` | Banka dönüşü |

Başarılı ödemede bağlı `student_payment_records` satırı otomatik tahsil edilir.

## Güvenlik

- Store Key / Provision Password yalnızca sunucu env’de.
- Chat veya commit’e yapıştırılmışsa bankadan yenileyin.
