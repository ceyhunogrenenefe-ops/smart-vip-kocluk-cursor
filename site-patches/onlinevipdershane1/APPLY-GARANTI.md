# Garanti Bonus POS — onlinevipdershane1

Koçluk panelinde `GARANTI_*` yok; site Vercel’de var. Panel form üretimini
`https://onlinevipdershane.com/api/garanti-init` üzerinden yapar (`mode=raw_amount`).

## Bu ajan neden siteye push edemiyor?

GitHub App **Cursor** (`cursor[bot]`) şu an yalnız:

- `ceyhunogrenenefe-ops/smart-vip-kocluk-cursor`

`onlinevipdershane1` installation listesinde değil → push 403.

## Sizin 1 dakikalık düzeltme (önerilen)

1. GitHub → **Settings → Applications → Installed → Cursor**
2. Repository access → **All repositories** *veya* `onlinevipdershane1` işaretle → **Save**
3. Yeni Cloud Agent’ı **`onlinevipdershane1`** reposundan açın (veya bu panel agent’ında):

```bash
bash site-patches/onlinevipdershane1/scripts/push-garanti-when-allowed.sh
```

## Manuel kopyala-yapıştır (App değiştirmeden)

```bash
cd /path/to/onlinevipdershane1
# panel reposundan:
PATCH=../smart-vip-kocluk-cursor/site-patches/onlinevipdershane1

cp "$PATCH/api/_lib/garanti.js" api/_lib/
cp "$PATCH/api/_lib/products.js" api/_lib/
cp "$PATCH/api/garanti-init.js" api/
cp "$PATCH/api/garanti-callback.js" api/
cp "$PATCH/api/garanti-init.js" api/garanti-token.js
cp "$PATCH/api/payment-provider.js" api/

git add api
git commit -m "fix: Garanti raw_amount + kitapMagaza + PROVOOS/3D_OOS_PAY"
git push origin main
```

Vercel otomatik deploy eder.

## Site env (zaten olmalı)

| Key | Örnek |
|---|---|
| `GARANTI_MERCHANT_ID` | `3267918` |
| `GARANTI_TERMINAL_ID` | `10410839` |
| `GARANTI_PROVISION_USER` | `PROVOOS` |
| `GARANTI_PROVISION_PASSWORD` | (PROVOOS şifresi) |
| `GARANTI_STORE_KEY` | (3D key) |
| `GARANTI_SECURITY_LEVEL` | `3D_OOS_PAY` |
| `GARANTI_MODE` | `prod` |
| `SITE_URL` | `https://onlinevipdershane.com` |

## Doğrulama

```bash
curl -sS -X POST https://onlinevipdershane.com/api/garanti-init \
  -H 'Content-Type: application/json' \
  -d '{"mode":"raw_amount","amountKurus":15000,"customer":{"parentName":"Test Veli AA","phone":"05551234567","email":"t@example.com"}}'
# paymentAmount: 15000 ve fields.secure3dsecuritylevel: 3D_OOS_PAY beklenir
```

Sonra panel muhasebe ödeme linki / kitap ödemesi site proxy ile çalışır.
