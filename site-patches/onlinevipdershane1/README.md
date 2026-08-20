# onlinevipdershane1 — PayTR + Garanti ödeme seçeneği

PayTR checkout `onlinevipdershane1` reposunda. Bu klasördeki dosyaları o repoya kopyalayıp deploy edin.

## 1) Dosyaları kopyala

`onlinevipdershane1` köküne:

| Kaynak (bu klasör) | Hedef (site repo) |
|---|---|
| `api/_lib/products.js` | `api/_lib/products.js` (kitap mağazası dinamik tutar) |
| `api/_lib/garanti.js` | `api/_lib/garanti.js` |
| `api/garanti-token.js` | `api/garanti-token.js` |
| `api/garanti-callback.js` | `api/garanti-callback.js` |
| `api/payment-provider.js` | `api/payment-provider.js` (üzerine yaz) |
| `odeme.html` | `odeme.html` (üzerine yaz) |

## 2) Vercel env — **onlinevipdershane1** projesi

⚠️ Panel (`smart-kocluk-ceyhu`) değil; site projesi:

| Key | Value |
|---|---|
| `GARANTI_MERCHANT_ID` | `3267918` |
| `GARANTI_TERMINAL_ID` | `10410839` |
| `GARANTI_PROVISION_USER` | `PROVAUT` |
| `GARANTI_PROVISION_PASSWORD` | (şifren) |
| `GARANTI_STORE_KEY` | (store key) |
| `GARANTI_MODE` | `prod` |
| `SITE_URL` | `https://onlinevipdershane.com` |

PayTR değişkenleri olduğu gibi kalsın.

## 3) Deploy

```bash
cd onlinevipdershane1
git add api/_lib/products.js api/_lib/garanti.js api/garanti-token.js api/garanti-callback.js api/payment-provider.js odeme.html
git commit -m "feat: kitap mağazası koçluk paneli ödeme yönlendirmesi (odeme.html + kitapMagaza)"
git push origin main
```

Vercel otomatik deploy eder. Env sonradan eklendiyse Redeploy.

## Sonuç

`/odeme.html` üzerinde iki seçenek görünür:

1. **PayTR** (varsayılan)
2. **Garanti BBVA**

Koçluk paneli kitap sepeti `?source=coaching&token=...&tutar=...` ile `/odeme.html` sayfasına gelir; sipariş özeti token ile koçluk API'sinden okunur.

## Koçluk paneli (smart-kocluk-ceyhu)

Supabase'de migration çalıştırın:

```sql
-- student-coaching-system/sql/2026-08-20-commerce-checkout-handoff.sql
```

Vercel deploy sonrası `/api/commerce-checkout-handoff` aktif olur.
