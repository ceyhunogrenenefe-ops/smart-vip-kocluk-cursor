# Meta → CRM checklist (manuel)

Production: `https://www.dersonlinevipkocluk.com` · CRM → Widgetler → **Meta Tanılama**

SQL (bir kez):
1. `student-coaching-system/sql/2026-09-14-meta-webhook-logs.sql`
2. **Zorunlu (FB DM/yorum için):** `student-coaching-system/sql/2026-09-14-crm-facebook-channel-check.sql`  
   Tanılama’da **FB kanal DB = CHECK eksik** görürseniz bu SQL’i çalıştırın.  
   Deploy sonrası kod Facebook’u geçici `fb:` önekiyle Instagram satırına yazar (UI’da FB görünür); SQL sonrası native `facebook` kanalı kullanılır.

Sonra Widgetler → **Hattı bağla / ensure_inbound** (Page `feed` + IG `comments` abone olur).

| # | Senaryo | Beklenen |
|---|---------|----------|
| 1 | Facebook sayfasına normal DM | CRM `facebook` conversation, `source_type=organic_dm` |
| 2 | Instagram’a normal DM | CRM `instagram`, `organic_dm` |
| 3 | Facebook gönderisine yorum | CRM `facebook` + `message_type=comment` + `post_comment` |
| 4 | Instagram gönderisine yorum | CRM `instagram` + comment + `post_comment` |
| 5 | Facebook Click-to-Messenger reklam | CRM `facebook`, `source_type=ad_dm`, `ad_id` dolu |
| 6 | Instagram reklam DM | CRM `instagram`, `ad_dm` + referral |
| 7 | Aynı kullanıcı önce yorum sonra DM | Aynı `contact_identifier` (PSID / IGSID) altında birleşir |
| 8 | Aynı webhook 2 kez | `message_id` / `fb_comment:` / `ig_comment:` unique → duplicate yok |

Tanılama: son 20 webhook event `processing_status=processed|error` görünmeli; sessiz drop olmamalı.  
`crm_sync_errors` webhook yanıtında doluysa Vercel log + Meta Tanılama → Son hata’ya bakın.
