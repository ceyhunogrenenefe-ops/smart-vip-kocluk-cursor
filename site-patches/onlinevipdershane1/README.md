# onlinevipdershane1 — Koçluk kitap sepeti → ödeme sayfası

Koçluk paneli (`dersonlinevipkocluk.com`) sepetten **Ödemeye Geç** deyince
`https://onlinevipdershane.com/odeme.html?source=coaching&token=...&tutar=...`
sayfasına yönlendirir.

Canlı sitede sepet/tutarın görünmesi için bu 2 dosya **zorunlu**:

| Dosya | Ne yapar |
|---|---|
| `odeme.html` | Koçluk token/tutar ile sipariş özeti gösterir |
| `api/_lib/products.js` | `kitapMagaza` ürünü + dinamik `amountKurus` |

## Hızlı deploy (onlinevipdershane1 reposu)

```bash
# smart-vip-kocluk-cursor reposundan kopyala:
cp site-patches/onlinevipdershane1/odeme.html ../onlinevipdershane1/odeme.html
cp site-patches/onlinevipdershane1/api/_lib/products.js ../onlinevipdershane1/api/_lib/products.js

cd ../onlinevipdershane1
git add odeme.html api/_lib/products.js
git commit -m "feat: koçluk paneli kitap sepeti ödeme (token + kitapMagaza)"
git push origin main
```

Vercel otomatik deploy eder.

## Test

1. Koçluk: sepete kitap ekle → Ödemeye Geç
2. URL: `onlinevipdershane.com/odeme.html?source=coaching&token=...&tutar=...`
3. Sağda sipariş özeti + tutar görünmeli
4. Veli bilgisi → PayTR

## Not

- `kitapMagaza` olmadan PayTR `Geçersiz ürün: kitapMagaza` döner.
- Eski site sepeti (`OVD_CART` localStorage) koçluk paneliyle paylaşılmaz; token şart.
