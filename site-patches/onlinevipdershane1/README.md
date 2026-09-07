# onlinevipdershane1 — PayTR + Garanti ödeme seçeneği

PayTR checkout `onlinevipdershane1` reposunda. Bu klasördeki dosyaları o repoya kopyalayıp deploy edin.

## 1) Dosyaları kopyala

`onlinevipdershane1` köküne:

| Kaynak (bu klasör) | Hedef (site repo) |
|---|---|
| `api/_lib/garanti.js` | `api/_lib/garanti.js` |
| `api/garanti-token.js` | `api/garanti-token.js` |
| `api/garanti-callback.js` | `api/garanti-callback.js` |
| `api/payment-provider.js` | `api/payment-provider.js` (üzerine yaz) |
| `api/commerce-checkout.js` | `api/commerce-checkout.js` (üzerine yaz — `apply_coupon`) |
| `odeme.html` | `odeme.html` (üzerine yaz) |
| `odeme-kitap.html` | `odeme-kitap.html` (üzerine yaz — `/odeme/kitap` kupon kutusu) |

## 2) Vercel env — **iki proje**

### Site (`onlinevipdershane1`)

| Key | Value |
|---|---|
| `GARANTI_MERCHANT_ID` | `3267918` |
| `GARANTI_TERMINAL_ID` | `10410839` |
| `GARANTI_PROVISION_USER` | `PROVOOS` |
| `GARANTI_PROVISION_PASSWORD` | (PROVOOS şifren) |
| `GARANTI_STORE_KEY` | (store key / 3D key) |
| `GARANTI_SECURITY_LEVEL` | `3D_OOS_PAY` |
| `GARANTI_MODE` | `prod` |
| `SITE_URL` | `https://onlinevipdershane.com` |

### Koçluk paneli (`smart-kocluk-ceyhu`) — **aynı değerler zorunlu**

Siteye eklemek yetmez. Panelde muhasebe linki / kitap ödemesi için aynı `GARANTI_*`
değişkenlerini panel Vercel projesine de ekleyip **Redeploy** edin.
`APP_PUBLIC_URL=https://www.dersonlinevipkocluk.com`

⚠️ `PROVAUT` + `3D_PAY` kullanmayın; canlı Bonus POS **PROVOOS** + **3D_OOS_PAY**.

PayTR değişkenleri olduğu gibi kalsın.

## 3) Deploy

```bash
cd onlinevipdershane1
git add api/_lib/garanti.js api/garanti-token.js api/garanti-callback.js api/payment-provider.js api/commerce-checkout.js odeme.html odeme-kitap.html
git commit -m "feat: PayTR + Garanti + kitap ödeme kuponu"
git push origin main
```

Vercel otomatik deploy eder. Env sonradan eklendiyse Redeploy.

## Sonuç

`/odeme.html` üzerinde iki seçenek görünür:

1. **PayTR** (varsayılan)
2. **Garanti BBVA**

Supabase (koçluk): `commerce_checkout_handoffs` tablosu gerekli (token için).

---

## Site UX paketi (analiz popup / ücretsiz deneme / Başarılarımız)

Bkz. [APPLY-SITE-UX.md](./APPLY-SITE-UX.md) — `0001-site-trial-basari.patch` ile `onlinevipdershane1` reposuna uygulanır.
