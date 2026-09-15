# Meta → CRM checklist (manuel)

Production: `https://www.dersonlinevipkocluk.com` · CRM → Widgetler → **Meta Tanılama**

Meta resmi akış: [Setup Webhooks Subscriptions](https://developers.facebook.com/docs/instagram-platform/webhooks)

| Adım | Meta | Bizde |
|------|------|--------|
| 1 | Create endpoint (GET verify + POST) | `/api/meta/webhook` — `META_WEBHOOK_VERIFY_TOKEN` |
| 2 | App webhook fields | `object=instagram` + `object=page` → messages, referral, comments… |
| 3 | `POST /{Page\|IG}/subscribed_apps` | CRM **Hattı bağla** (`ensure_meta_social`) |
| 4 | Test + **Live** + Advanced Access | Gerçek IG DM (Dashboard Test ≠ CRM) |

## Instagram reklam / organik DM

1. Meta App Dashboard → **Live mode** (Development’ta yalnız tester DM’i).
2. App Review → **Advanced Access**: `instagram_manage_messages`, `pages_messaging` (+ Business Verification).
3. Webhooks: Instagram + Page fields; Callback = production `/api/meta/webhook`.
4. CRM → Widgetler → **Hattı bağla** (Page + mümkünse IG account `subscribed_apps`).
5. Messaging partner / Conversation Routing: yalnız SmartKocluk (Kommo yok).
6. Tester olmayan IG’den DM + reklam CTM → Inbox `channel=instagram`.

Tanılama paneli: **Meta Setup Webhooks (4 adım)** + **IG DM Graph yetkisi**.

| Sinyal | Anlam |
|--------|--------|
| Yorum/Reels var, messaging POST yok | `META_DID_NOT_DELIVER` — genelde Advanced Access / Live |
| `likely_cause=missing_advanced_access_or_permission` | Conversations API (#3) — App Review |
| Dashboard “Test” / entry.id=0 | Sentetik — CRM konuşması oluşmaz |
| WA hit > 0, IG hit = 0 | Endpoint OK; Meta IG messaging göndermiyor |

WhatsApp reklamları WABA webhook ile ayrı gelir.

SQL (bir kez):
1. `student-coaching-system/sql/2026-09-14-meta-webhook-logs.sql`
2. **Zorunlu (FB DM/yorum için):** `student-coaching-system/sql/2026-09-14-crm-facebook-channel-check.sql`

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
