# Meta → CRM checklist (manuel)

Production: `https://www.dersonlinevipkocluk.com` · CRM → Widgetler → **Meta Tanılama**

SQL (bir kez): `student-coaching-system/sql/2026-09-14-meta-webhook-logs.sql`

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
