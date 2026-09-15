# Meta → CRM checklist (manuel)

Production: `https://www.dersonlinevipkocluk.com` · CRM → Widgetler → **Meta Tanılama**

## ÖNCE BUNU OKUYUN — Instagram DM / reklam mesajı gelmiyorsa

**Kanıt (2026-09-15):** `/api/cron/crm-instagram-sync` her 2 dakikada Graph’a soruyor ve
her seferinde şu yanıtı alıyor:

```
(#3) Application does not have the capability to make this API call. | code=3
```

Bu, uygulamanın Instagram DM okuma yetkisinin **olmadığı** anlamına gelir. Sonucu:

| Ne | Durum | Neden |
|---|---|---|
| Instagram yorumları | ✅ geliyor | yorum izni ayrı, verilmiş |
| Uygulamada rolü olan hesabın DM’i | ✅ geliyor | Standard Access test hesaplarını kapsar |
| Gerçek müşteri DM’i | ❌ gelmiyor | Advanced Access yok |
| Instagram reklam (Click-to-Message) DM’i | ❌ gelmiyor | Advanced Access yok |
| WhatsApp | ✅ geliyor | ayrı WABA hattı, etkilenmez |

Bu **kod hatası değildir** ve kod değişikliğiyle çözülemez. Meta App Dashboard’da
izin yükseltmesi gerekir:

1. **Meta App Dashboard → App Review → Permissions and Features**
2. `instagram_manage_messages` → **Advanced Access** isteyin (Standard Access yetmez)
3. `pages_messaging` → **Advanced Access** isteyin
4. `pages_manage_metadata` → **Advanced Access** isteyin
5. Uygulamayı **Development** değil **Live** moda alın
6. Onay geldikten sonra CRM → Widgetler → **Hattı bağla** (token yeni izinleri alsın)

**Doğrulama:** `/api/cron/crm-instagram-sync` `ok:true` dönmeli. Ondan sonra reklamdan
gerçek bir test DM atın; Inbox’ta `channel=instagram`, `source_type=ad_dm` görünmeli.

> Not: Meta App Dashboard’daki “Send test” butonu `entry.id=0` ile boş payload yollar;
> CRM konuşması oluşturmaz. Gerçek bir Instagram hesabından DM gönderin.

## Kommo

Kommo hâlâ Instagram mesaj ortağıysa Meta teslimatı oraya da yönlendirir. Advanced Access
verildikten sonra DM hâlâ gelmiyorsa sırayla:

1. **Kommo → Ayarlar → Entegrasyonlar → Instagram → Bağlantıyı kaldır**
2. **Meta Business Suite** → Instagram hesabı → bağlı iş ortakları listesinden Kommo’yu çıkarın
3. Instagram (profesyonel) → Mesajlar ayarlarında üçüncü taraf erişimi olmasın
4. CRM → Widgetler → **Hattı bağla** (`ensure_inbound`)

## Tanılama okuma

- CRM → Widgetler → **Meta Tanılama** → `instagram_dm_blocker` alanı
  `META_ADVANCED_ACCESS_REQUIRED` ise yukarıdaki izin adımları gösterilir.
- WA hit > 0 ve IG hit = 0 → “Instagram reklam DM partner block”.
- Yorumlar geliyor ama gerçek DM POST’u yok → **META_DID_NOT_DELIVER**.

## SQL (bir kez)

1. `student-coaching-system/sql/2026-09-14-meta-webhook-logs.sql` ✅ (2026-09-15’te uygulandı)
2. **Zorunlu (FB DM/yorum için):** `student-coaching-system/sql/2026-09-14-crm-facebook-channel-check.sql`
   Tanılama’da **FB kanal DB = CHECK eksik** görürseniz bu SQL’i çalıştırın.

Sonra Widgetler → **Hattı bağla / ensure_inbound**.

## Kabul testleri

| # | Senaryo | Beklenen |
|---|---------|----------|
| 1 | Facebook sayfasına normal DM | CRM `facebook`, `organic_dm` |
| 2 | Instagram’a normal DM | CRM `instagram`, `organic_dm` |
| 3 | Facebook gönderisine yorum | CRM `facebook` + comment |
| 4 | Instagram gönderisine yorum | CRM `instagram` + comment |
| 5 | Facebook Click-to-Messenger reklam | CRM `facebook`, `ad_dm` |
| 6 | Instagram reklam DM | CRM `instagram`, `ad_dm` + referral |
| 7 | Aynı kullanıcı önce yorum sonra DM | Aynı contact altında birleşir |
| 8 | Aynı webhook 2 kez | unique message_id → duplicate yok |

## Webhook payload biçimleri (kod notu)

Instagram DM iki farklı biçimde gelebilir; ikisi de desteklenir:

```jsonc
// A) messaging dizisi
{ "object":"instagram", "entry":[{ "id":"<IG_ID>", "messaging":[{ "sender":{...}, "message":{...} }] }] }

// B) changes içinde tek olay  (önceden sentetik test sanılıp düşürülüyordu)
{ "object":"instagram", "entry":[{ "id":"<IG_ID>",
  "changes":[{ "field":"messages", "value":{ "sender":{...}, "message":{...} } }] }] }
```
