# Meta → CRM checklist (manuel)

Production: `https://www.dersonlinevipkocluk.com` · CRM → Widgetler → **Meta Tanılama**

## Instagram reklam DM (Kommo köprüsü YOK — doğrudan CRM)

Kommo’yu kapatacaksınız; IG reklam mesajları native Meta webhook ile CRM’e düşmeli.

1. **Kommo → Ayarlar → Entegrasyonlar → Instagram → Bağlantıyı kaldır**  
   (CRM↔Kommo mesaj köprüsü kurulmaz.)
2. **Meta Business Suite** → Instagram hesabı → bağlı iş ortakları / messaging partner listesinden Kommo’yu çıkarın.
3. Instagram (profesyonel) → Mesajlar ayarlarında üçüncü taraf / Kommo erişimi olmasın.
4. CRM → Widgetler → **Hattı bağla** (`ensure_inbound`).
5. Instagram **Click to Message** reklamından test DM → Inbox `channel=instagram`.

Tanılama:
- WA hit > 0 ve IG hit = 0 → kırmızı kutu “Instagram reklam DM partner block”.
- Yorumlar geliyor ama gerçek DM POST’u yok → amber kutu **META_DID_NOT_DELIVER** (Kommo hâlâ DM alıcısı; kod drop değil).
- Meta App Dashboard “Send test” → entry.id=0 sentetik; CRM konuşması oluşmaz. Gerçek IG hesabından DM atın.

WhatsApp reklamları ayrı WABA hattından zaten gelir; IG için Meta teslimatının Kommo’dan sökülmesi şart.

SQL (bir kez):
1. `student-coaching-system/sql/2026-09-14-meta-webhook-logs.sql`
2. **Zorunlu (FB DM/yorum için):** `student-coaching-system/sql/2026-09-14-crm-facebook-channel-check.sql`  
   Tanılama’da **FB kanal DB = CHECK eksik** görürseniz bu SQL’i çalıştırın.

Sonra Widgetler → **Hattı bağla / ensure_inbound**.

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
