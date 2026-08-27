# Koçluk sepeti → onlinevipdershane.com ödeme (PayTR / Garanti)

Koçluk paneli **ödeme anahtarı istemez**. Ödeme sitede kalır.

## Zorunlu dosyalar (canlı siteye)

Canlı `odeme.html` şu an koçluk sepetini okumuyor; bu yüzden “sepette ürün yok” görünüyor.

| Kaynak (bu klasör) | Canlı siteye kopyala |
|---|---|
| `odeme.html` | `odeme.html` (**üzerine yaz** — Garanti+PayTR seçenekli sürüm + koçluk) |
| `api/_lib/products.js` | `api/_lib/products.js` (**tek kopya**, çift yapıştırma yok) |
| `api/commerce-checkout.js` | `api/commerce-checkout.js` (`apply_coupon` — `/odeme/kitap`) |
| `odeme-kitap.html` | `odeme-kitap.html` (`/odeme/kitap` kupon kutusu) |

### GitHub / bilgisayar

1. **Canlı sitenin deploy edildiği projeyi** açın (Vercel’de `onlinevipdershane.com` hangi GitHub reposuna bağlıysa o).
2. Bu dosyaları kopyalayıp `main`’e push edin.
3. Vercel Production deploy bitsin.
4. Kontrol:
   - Sayfada `source=coaching` ile sepet özeti görünmeli
   - PayTR `kitapMagaza` kabul etmeli
   - `/odeme/kitap?token=` kupon kutusu + toplam güncellenmeli

### Doğrulama (deploy sonrası)

Tarayıcıda açın:

`https://onlinevipdershane.com/odeme.html?source=coaching&tutar=15000&ref=test`

- Sağda **15,00₺** / Kitap Mağazası görünmeli
- `sepet.html`’e atmamalı

## Koçluk paneli

Sepet → Ödemeye Geç → otomatik:

`https://onlinevipdershane.com/odeme.html?source=coaching&token=...&tutar=...`

Supabase (koçluk): `commerce_checkout_handoffs` tablosu gerekli (token için).
