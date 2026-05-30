# WhatsApp ders hatırlatma cron’ları

Test mesajı panelden gider; otomatik hatırlatma **Vercel cron** veya **harici cron** ile tetiklenir.

## Neden test gider, cron gitmez?

| Neden | Kontrol |
|--------|---------|
| **Vercel Hobby** | `*/5 * * * *` günde 1 kez çalışır; 5 dk’da bir **çalışmaz**. Pro gerekir veya harici cron. |
| **Cron hiç tetiklenmiyor** | WhatsApp Merkezi → Cron durumu → son çalışma saati |
| **Zaman penceresi kaçırıldı** | Hatırlatma ders başlamadan **7–13 dk** arasında gider (≈10 dk) |
| **Oturum yok** | Grup dersi için `class_sessions` satırı + `status=scheduled` |
| **Şablon / Meta** | `message_templates.meta_template_name` dolu ve Meta’da onaylı |
| **Telefon yok** | Öğrenci/veli telefonu kartta kayıtlı |
| **Boş ders linki** | Artık site URL’si yedek olarak kullanılır |

## Vercel ortam değişkenleri

Production’da olmalı:

- `META_WHATSAPP_TOKEN`
- `META_PHONE_NUMBER_ID`
- `CRON_SECRET` (harici cron için güçlü rastgele anahtar)

İsteğe bağlı (varsayılan 7–13 dk):

- `LESSON_REMINDER_WINDOW_MODE=narrow`
- `LESSON_REMINDER_MIN_MINUTES=7`
- `LESSON_REMINDER_MAX_MINUTES=13`

Eski 45 dk davranışı için: `LESSON_REMINDER_WINDOW_MODE=lead` ve `LESSON_REMINDER_MAX_LEAD_MINUTES=45`

## Hobby plan — harici cron (önerilen)

1. [cron-job.org](https://cron-job.org) veya benzeri servis
2. **Her 5 dakika** tetikle
3. URL:

   `https://www.dersonlinevipkocluk.com/api/cron/reminders-tick`

4. HTTP header:

   `Authorization: Bearer BURAYA_CRON_SECRET`

5. Vercel → Settings → Environment Variables → `CRON_SECRET` aynı değer

Bu tek URL şunları çalıştırır: birebir ders + grup ders (piggyback) + görüşme hatırlatmaları.

## Pro plan

`vercel.json` içindeki `*/5 * * * *` cron’ları Vercel otomatik çalıştırır. Yine de harici cron yedek olarak kullanılabilir.

## Manuel test (cron simülasyonu)

Terminal (CRON_SECRET bilinen):

```bash
curl -H "Authorization: Bearer CRON_SECRET" \
  "https://www.dersonlinevipkocluk.com/api/cron/reminders-tick"
```

Yanıtta `class_group_reminders`, `log`, `due_sessions` alanlarına bakın.

## Supabase

Bir kez çalıştırın: `student-coaching-system/sql/2026-05-25-cron-run-log.sql`

## Grup dersi manuel

Canlı Grup Dersi → ders kartında **Hatırlat** — cron ile aynı şablon.
