/**
 * Vercel Scheduled Functions zamanları **her zaman UTC** ile yazılır.
 * Üretim özeti: kök `vercel.json` içindeki `crons[]`; bu dosyadaki string sabitleri ile **aynı kalmalıdır**.
 *
 * Türkiye (Europe/Istanbul) için yaz/kış saati uygulanmıyor; yıl boyu **UTC+3** kabul edilir.
 *
 * --- Günlük rapor WhatsApp (handlers/cron-report-check.js) ---
 * Hedef: Her akşam **İstanbul 23:00**.
 * Bu yüzden vercel.json içinde **UTC olarak `0 20 * * *`** kullanılır (20:00 UTC + 3 saat = 23:00 TR).
 *
 * **Yanlış:** `0 22 * * *` (UTC) → İstanbul’da **01:00** tetiklenir; kullanmayın.
 *
 * Handler yine de `getIstanbulHour() === 23` ile filtreler (Bearer ile saat dışı testte yanlış gönderimi önler).
 *
 * --- Canlı ders hatırlatma (handlers/cron-lesson-reminder.js) ---
 * `*/5 * * * *` UTC; pencere üst sınırı `LESSON_REMINDER_MAX_LEAD_MINUTES` (varsayılan 45 dk, en fazla 1440).
 *
 * --- Grup canlı ders hatırlatma (handlers/cron-class-lesson-reminders.js) ---
 * `*/5 * * * *` UTC; gönderim penceresi `CLASS_LESSON_REMINDER_WINDOW_MINUTES` (varsayılan 12 dk, 5–25 arası clamp).
 */

/** vercel.json → crons → daily-report-reminders ile aynı olmalı */
export const CRON_DAILY_REPORT_REMINDERS_UTC = '0 20 * * *';

/** vercel.json → crons → lesson-reminders ile aynı olmalı */
export const CRON_LESSON_REMINDERS_UTC = '*/5 * * * *';
