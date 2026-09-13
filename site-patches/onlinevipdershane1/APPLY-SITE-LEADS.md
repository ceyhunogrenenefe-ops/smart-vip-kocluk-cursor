# Website formu → CRM (Kayıt Takibi + Gelen Kutusu)

`onlinevipdershane.com` iletişim / “Sizi Arayalım” / ücretsiz analiz / reklam landing formları
koçluk paneline düşer. Kommo köprüsü yok.

Panel endpoint (bu repoda, production):

`POST https://www.dersonlinevipkocluk.com/api/site-leads`

## En hızlı yol — tek script

Tüm HTML’lerin `</body>` öncesine:

```html
<script src="https://www.dersonlinevipkocluk.com/crm-site-lead.js" defer></script>
```

veya bu paketten:

```bash
cp assets/crm-lead.js "$SITE_ROOT/assets/"
# inject-float-scripts.sh crm-lead.js’i de ekler
bash scripts/inject-float-scripts.sh "$SITE_ROOT"
```

Script, mevcut `fetch('/api/iletisim')` ve `fetch('/api/assessment')` (op=submit)
gönderimlerini bozmadan CRM’ye kopyalar. UTM / `fbclid` reklam formu olarak işaretlenir.

## İletişim + callback

- Canlı `iletisim.html` zaten `/api/iletisim` postediyor (`ad_soyad`, `telefon`, `sinif`, `program`, `not`).
- `assets/callback-ui.js` “Sizi Arayalım” modalını CRM’ye de yazar.

## Sunucu tarafı (opsiyonel, daha sağlam)

Mevcut `api/iletisim.js` / `api/assessment.js` içine (Kommo/e-posta kalsın):

```js
import { forwardCrmLead } from './_lib/forward-crm-lead.js';

// başarılı kayıttan sonra, kullanıcıyı bekletmeden:
forwardCrmLead({ ...body, form_kind: 'iletisim', page: req.headers.referer }).catch(() => {});
```

`api/_lib/forward-crm-lead.js` bu klasörde.

İsteğe bağlı Vercel env (site projesi): `SITE_LEAD_WEBHOOK_SECRET` — panelde aynı değer.

## CRM’de nerede görünür?

- **Kayıt Takibi** kanban → Yeni lead (`website_form` / `website_form_ad`)
- Kartta **Web** rozeti
- Lead **Mesajlar** + **Gelen Kutusu** (telefon eşleşince sonraki WhatsApp aynı karta bağlanır)

## Uygula

Site reposuna push bu ajanın token’ında yoksa (`onlinevipdershane1` 403):
Cursor App → All repositories veya site reposunu işaretleyip **yeni** ajan açın.
Bu paketi kopyalayıp site `main`’e merge etmek yeterli; panel tarafı ayrı deploy olur.
